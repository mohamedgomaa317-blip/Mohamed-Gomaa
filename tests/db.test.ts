import { describe, expect, it } from 'vitest';
import { migrate, openDb, seed } from '../src/db/index.js';
import type { Store } from '../src/db/store.js';
import { memStore } from './helpers.js';

function addUser(store: Store) {
  store.upsertUser({ name: 'Omar', level: 'A1', target_level: 'B2', daily_minutes: 15, locale: 'ar' });
}

describe('database', () => {
  it('runs migrations once, enables WAL-compatible pragmas and foreign keys', () => {
    const db = openDb(':memory:');
    expect(migrate(db)).toEqual([]); // already applied
    const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    expect(versions).toEqual([{ version: 1 }, { version: 2 }]);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('seeding is idempotent and preserves learner data', () => {
    const store = memStore();
    addUser(store);
    const unit = store.units('A1')[0]!;
    const ex = store.exercisesForUnit(unit.id)[0]!;
    store.recordAttempt({
      exercise_id: ex.id,
      unit_id: unit.id,
      level: 'A1',
      correct: true,
      answer_given: 'x',
      time_ms: 5,
    });
    expect(seed(store.db)).toBe(false); // hash unchanged → skipped
    store.db.prepare("UPDATE settings SET value = 'old' WHERE key = 'curriculum_hash'").run();
    expect(seed(store.db)).toBe(true); // re-sync
    expect((store.db.prepare('SELECT COUNT(*) n FROM attempts').get() as { n: number }).n).toBe(1);
    expect(store.units()).toHaveLength(15);
  });

  it('orders units A1 → C1 and finds the next unit', () => {
    const store = memStore();
    const ids = store.units().map((u) => u.id);
    expect(ids[0]).toBe('a1-01');
    expect(ids.at(-1)).toBe('c1-03');
    expect(store.nextUnit('A1')?.id).toBe('a1-01');
  });

  it('unit progress uses the latest attempt per exercise', () => {
    const store = memStore();
    const unit = store.units('A1')[0]!;
    const exs = store.exercisesForUnit(unit.id);
    for (const ex of exs) {
      store.recordAttempt({
        exercise_id: ex.id,
        unit_id: unit.id,
        level: 'A1',
        correct: false,
        answer_given: '',
        time_ms: 1,
      });
      store.recordAttempt({
        exercise_id: ex.id,
        unit_id: unit.id,
        level: 'A1',
        correct: true,
        answer_given: '',
        time_ms: 1,
      });
    }
    const p = store.unitProgress(unit);
    expect(p.accuracy).toBe(1);
    expect(p.passed).toBe(true);
    expect(store.nextUnit('A1')?.id).toBe('a1-02');
  });

  it('reviews: add, become due, rate, count', () => {
    const store = memStore();
    const v = store.vocabForUnit(store.units('A1')[0]!)[0]!;
    const now = new Date('2026-05-01T10:00:00Z');
    expect(store.addToReviews(v.id, now)).toBe(true);
    expect(store.addToReviews(v.id, now)).toBe(false); // no duplicates
    expect(store.countDue(now)).toBe(1);
    const r = store.rateReview(v.id, 2, now);
    expect(r.interval_days).toBe(1);
    expect(store.countDue(now)).toBe(0);
    expect(store.countDue(new Date('2026-05-02T10:00:01Z'))).toBe(1);
  });

  it('mistakes: one open entry per exercise, resolved by a correct answer', () => {
    const store = memStore();
    const ex = store.exercisesForUnit('a1-01')[0]!;
    const m = { exercise_id: ex.id, question: ex.prompt, given_answer: 'am', correct_answer: 'is', explanation: '' };
    store.addMistake(m);
    store.addMistake({ ...m, given_answer: 'are' });
    expect(store.countOpenMistakes()).toBe(1);
    expect(store.openMistakes()[0]!.given_answer).toBe('are');
    store.resolveMistakesForExercise(ex.id);
    expect(store.countOpenMistakes()).toBe(0);
  });

  it('streak and xp update on the user row', () => {
    const store = memStore();
    addUser(store);
    store.touchStreak(new Date(2026, 4, 1, 12));
    store.touchStreak(new Date(2026, 4, 2, 12));
    store.addXp(25);
    const u = store.getUser()!;
    expect(u.streak_count).toBe(2);
    expect(u.longest_streak).toBe(2);
    expect(u.xp).toBe(25);
  });

  it('level stats count units and known vocab', () => {
    const store = memStore();
    const s = store.levelStats('A1');
    expect(s).toEqual({ unitsTotal: 3, unitsPassed: 0, vocabTotal: 18, vocabKnown: 0 });
  });

  it('reset keeps the curriculum', () => {
    const store = memStore();
    addUser(store);
    store.resetProgress();
    expect(store.getUser()).toBeUndefined();
    expect(store.units()).toHaveLength(15);
  });
});
