import type { DB } from './index.js';
import type {
  ExerciseRow,
  Level,
  Locale,
  MistakeRow,
  ReviewRow,
  UnitRow,
  UserRow,
  VocabRow,
  WordsRow,
} from '../types.js';
import { LEVELS } from '../types.js';
import { schedule, newCard, type Rating } from '../engine/srs.js';
import { UNIT_PASS_MARK, type LevelStats } from '../engine/level.js';
import { localDate, updateStreak } from '../engine/streak.js';

const iso = (d: Date = new Date()): string => d.toISOString();

export interface UnitProgress {
  unit: UnitRow;
  attempted: number;
  total: number;
  /** Share of the unit's exercises whose latest attempt was correct. */
  accuracy: number;
  passed: boolean;
}

export interface DayActivity {
  day: string;
  items: number;
  correct: number;
}

/** All SQL lives here, as prepared statements. */
export class Store {
  constructor(readonly db: DB) {}

  // ── users ──────────────────────────────────────────────
  getUser(): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = 1').get() as UserRow | undefined;
  }

  upsertUser(u: { name: string; level: Level; target_level: Level; daily_minutes: number; locale: Locale }): void {
    this.db
      .prepare(
        `INSERT INTO users (id, name, level, target_level, daily_minutes, created_at, locale)
         VALUES (1, @name, @level, @target_level, @daily_minutes, @created_at, @locale)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, level=excluded.level, target_level=excluded.target_level,
           daily_minutes=excluded.daily_minutes, locale=excluded.locale`,
      )
      .run({ ...u, created_at: iso() });
  }

  updateUserFields(
    fields: Partial<Pick<UserRow, 'name' | 'level' | 'target_level' | 'daily_minutes' | 'locale'>>,
  ): void {
    const keys = Object.keys(fields) as (keyof typeof fields)[];
    if (keys.length === 0) return;
    const set = keys.map((k) => `${k} = @${k}`).join(', ');
    this.db.prepare(`UPDATE users SET ${set} WHERE id = 1`).run(fields);
  }

  addXp(xp: number): void {
    this.db.prepare('UPDATE users SET xp = xp + ? WHERE id = 1').run(xp);
  }

  /** Marks today as studied; returns the new streak. */
  touchStreak(now: Date = new Date()): { streak: number; increased: boolean } {
    const u = this.getUser();
    if (!u) return { streak: 0, increased: false };
    const next = updateStreak(
      { streak: u.streak_count, longest: u.longest_streak, lastDate: u.last_session_date },
      localDate(now),
    );
    if (next.changed) {
      this.db
        .prepare('UPDATE users SET streak_count = ?, longest_streak = ?, last_session_date = ? WHERE id = 1')
        .run(next.streak, next.longest, next.lastDate);
    }
    return { streak: next.streak, increased: next.changed };
  }

  // ── sessions ───────────────────────────────────────────
  startSession(mode: string): number {
    return Number(
      this.db.prepare('INSERT INTO sessions (started_at, mode) VALUES (?, ?)').run(iso(), mode).lastInsertRowid,
    );
  }

  finishSession(id: number, s: { xp: number; accuracy: number | null; items: number }): void {
    this.db
      .prepare('UPDATE sessions SET finished_at = ?, xp_earned = ?, accuracy = ?, items_done = ? WHERE id = ?')
      .run(iso(), s.xp, s.accuracy, s.items, id);
  }

  // ── curriculum ─────────────────────────────────────────
  units(level?: Level): UnitRow[] {
    return level
      ? (this.db.prepare('SELECT * FROM units WHERE level = ? ORDER BY order_index').all(level) as UnitRow[])
      : (this.db
          .prepare(
            `SELECT * FROM units ORDER BY CASE level WHEN 'A1' THEN 1 WHEN 'A2' THEN 2 WHEN 'B1' THEN 3 WHEN 'B2' THEN 4 ELSE 5 END, order_index`,
          )
          .all() as UnitRow[]);
  }

  unit(id: string): UnitRow | undefined {
    return this.db.prepare('SELECT * FROM units WHERE id = ?').get(id) as UnitRow | undefined;
  }

  exercisesForUnit(unitId: string): ExerciseRow[] {
    return this.db.prepare('SELECT * FROM exercises WHERE unit_id = ? ORDER BY id').all(unitId) as ExerciseRow[];
  }

  exercise(id: string): ExerciseRow | undefined {
    return this.db.prepare('SELECT * FROM exercises WHERE id = ?').get(id) as ExerciseRow | undefined;
  }

  exercisesByLevel(level: Level, types: string[]): ExerciseRow[] {
    const ph = types.map(() => '?').join(',');
    return this.db
      .prepare(`SELECT * FROM exercises WHERE level = ? AND type IN (${ph}) ORDER BY id`)
      .all(level, ...types) as ExerciseRow[];
  }

  vocabForUnit(unit: UnitRow): VocabRow[] {
    const ids = JSON.parse(unit.vocab_json) as string[];
    if (ids.length === 0) return [];
    const rows = this.db
      .prepare(`SELECT * FROM vocab WHERE id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids) as VocabRow[];
    return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is VocabRow => !!r);
  }

  vocab(id: string): VocabRow | undefined {
    return this.db.prepare('SELECT * FROM vocab WHERE id = ?').get(id) as VocabRow | undefined;
  }

  searchVocab(q: string, limit = 20): VocabRow[] {
    const like = `%${q.toLowerCase()}%`;
    return this.db
      .prepare('SELECT * FROM vocab WHERE lower(word) LIKE ? OR translation LIKE ? OR lower(example) LIKE ? LIMIT ?')
      .all(like, `%${q}%`, like, limit) as VocabRow[];
  }

  dictationForLevel(level: Level): WordsRow[] {
    return this.db.prepare('SELECT * FROM words WHERE level = ? ORDER BY id').all(level) as WordsRow[];
  }

  dictationForUnit(unitId: string): WordsRow[] {
    return this.db.prepare('SELECT * FROM words WHERE unit_id = ? ORDER BY id').all(unitId) as WordsRow[];
  }

  // ── progress ───────────────────────────────────────────
  unitProgress(unit: UnitRow): UnitProgress {
    const ids = JSON.parse(unit.exercise_ids_json) as string[];
    const rows = this.db
      .prepare(
        `SELECT a.exercise_id, a.correct FROM attempts a
         JOIN (SELECT exercise_id, MAX(id) AS mid FROM attempts WHERE unit_id = ? GROUP BY exercise_id) last
           ON last.mid = a.id`,
      )
      .all(unit.id) as { exercise_id: string; correct: number }[];
    const relevant = rows.filter((r) => ids.includes(r.exercise_id));
    const correct = relevant.filter((r) => r.correct === 1).length;
    const accuracy = ids.length === 0 ? 0 : correct / ids.length;
    return { unit, attempted: relevant.length, total: ids.length, accuracy, passed: accuracy >= UNIT_PASS_MARK };
  }

  /** First unit at `level` not yet passed, else null. */
  nextUnit(level: Level): UnitRow | null {
    for (const u of this.units(level)) {
      if (!this.unitProgress(u).passed) return u;
    }
    return null;
  }

  levelStats(level: Level): LevelStats {
    const units = this.units(level);
    const unitsPassed = units.filter((u) => this.unitProgress(u).passed).length;
    const v = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN r.repetitions >= 2 THEN 1 ELSE 0 END) AS known
         FROM vocab v LEFT JOIN reviews r ON r.vocab_id = v.id WHERE v.level = ?`,
      )
      .get(level) as { total: number; known: number | null };
    return { unitsTotal: units.length, unitsPassed, vocabTotal: v.total, vocabKnown: v.known ?? 0 };
  }

  allLevelStats(): Record<Level, LevelStats> {
    return Object.fromEntries(LEVELS.map((l) => [l, this.levelStats(l)])) as Record<Level, LevelStats>;
  }

  // ── reviews (SRS) ──────────────────────────────────────
  addToReviews(vocabId: string, now: Date = new Date(), firstDueInMs = 0): boolean {
    const c = newCard();
    const res = this.db
      .prepare(
        `INSERT INTO reviews (vocab_id, due_at, interval_days, ease_factor, repetitions, lapses, last_rating)
         VALUES (?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(vocab_id) DO NOTHING`,
      )
      .run(vocabId, iso(new Date(now.getTime() + firstDueInMs)), c.intervalDays, c.easeFactor, c.repetitions, c.lapses);
    return res.changes > 0;
  }

  dueReviews(now: Date = new Date(), limit = 50): (ReviewRow & VocabRow)[] {
    return this.db
      .prepare(
        `SELECT r.*, v.* FROM reviews r JOIN vocab v ON v.id = r.vocab_id
         WHERE r.due_at <= ? ORDER BY r.due_at LIMIT ?`,
      )
      .all(iso(now), limit) as (ReviewRow & VocabRow)[];
  }

  countDue(now: Date = new Date()): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE due_at <= ?').get(iso(now)) as { n: number }).n;
  }

  rateReview(vocabId: string, rating: Rating, now: Date = new Date()): ReviewRow {
    const r = this.db.prepare('SELECT * FROM reviews WHERE vocab_id = ?').get(vocabId) as ReviewRow | undefined;
    const card = r
      ? { intervalDays: r.interval_days, easeFactor: r.ease_factor, repetitions: r.repetitions, lapses: r.lapses }
      : newCard();
    const next = schedule(card, rating, now);
    const row: ReviewRow = {
      vocab_id: vocabId,
      due_at: iso(next.dueAt),
      interval_days: next.intervalDays,
      ease_factor: next.easeFactor,
      repetitions: next.repetitions,
      lapses: next.lapses,
      last_rating: rating,
    };
    this.db
      .prepare(
        `INSERT INTO reviews (vocab_id, due_at, interval_days, ease_factor, repetitions, lapses, last_rating)
         VALUES (@vocab_id, @due_at, @interval_days, @ease_factor, @repetitions, @lapses, @last_rating)
         ON CONFLICT(vocab_id) DO UPDATE SET due_at=excluded.due_at, interval_days=excluded.interval_days,
           ease_factor=excluded.ease_factor, repetitions=excluded.repetitions, lapses=excluded.lapses,
           last_rating=excluded.last_rating`,
      )
      .run(row);
    return row;
  }

  vocabCounts(): { learning: number; known: number; mastered: number; total: number } {
    return this.db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM vocab) AS total,
                COUNT(*) AS learning,
                COALESCE(SUM(CASE WHEN repetitions >= 2 THEN 1 ELSE 0 END), 0) AS known,
                COALESCE(SUM(CASE WHEN repetitions >= 3 AND interval_days >= 21 THEN 1 ELSE 0 END), 0) AS mastered
         FROM reviews`,
      )
      .get() as { learning: number; known: number; mastered: number; total: number };
  }

  // ── attempts & mistakes ────────────────────────────────
  recordAttempt(a: {
    exercise_id: string;
    unit_id: string | null;
    level: Level;
    correct: boolean;
    answer_given: string;
    time_ms: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO attempts (exercise_id, unit_id, level, correct, answer_given, created_at, time_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(a.exercise_id, a.unit_id, a.level, a.correct ? 1 : 0, a.answer_given, iso(), Math.round(a.time_ms));
  }

  addMistake(m: Omit<MistakeRow, 'id' | 'created_at' | 'resolved_at'>): void {
    // Don't flood the notebook: keep only one open entry per exercise.
    if (m.exercise_id) {
      const open = this.db
        .prepare('SELECT id FROM mistakes WHERE exercise_id = ? AND resolved_at IS NULL')
        .get(m.exercise_id) as { id: number } | undefined;
      if (open) {
        this.db
          .prepare('UPDATE mistakes SET given_answer = ?, created_at = ? WHERE id = ?')
          .run(m.given_answer, iso(), open.id);
        return;
      }
    }
    this.db
      .prepare(
        `INSERT INTO mistakes (exercise_id, question, given_answer, correct_answer, explanation, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(m.exercise_id, m.question, m.given_answer, m.correct_answer, m.explanation, iso());
  }

  openMistakes(limit = 100): MistakeRow[] {
    return this.db
      .prepare('SELECT * FROM mistakes WHERE resolved_at IS NULL ORDER BY created_at LIMIT ?')
      .all(limit) as MistakeRow[];
  }

  resolveMistake(id: number): void {
    this.db.prepare('UPDATE mistakes SET resolved_at = ? WHERE id = ?').run(iso(), id);
  }

  resolveMistakesForExercise(exerciseId: string): void {
    this.db
      .prepare('UPDATE mistakes SET resolved_at = ? WHERE exercise_id = ? AND resolved_at IS NULL')
      .run(iso(), exerciseId);
  }

  countOpenMistakes(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM mistakes WHERE resolved_at IS NULL').get() as { n: number }).n;
  }

  /** Accuracy per exercise type in [from, to). */
  accuracyByType(from: Date, to: Date = new Date()): Record<string, { n: number; acc: number }> {
    const rows = this.db
      .prepare(
        `SELECT e.type AS type, COUNT(*) AS n, AVG(a.correct) AS acc
         FROM attempts a JOIN exercises e ON e.id = a.exercise_id
         WHERE a.created_at >= ? AND a.created_at < ? GROUP BY e.type`,
      )
      .all(iso(from), iso(to)) as { type: string; n: number; acc: number }[];
    return Object.fromEntries(rows.map((r) => [r.type, { n: r.n, acc: r.acc }]));
  }

  /** Items done per local day for the last `days` days (from attempts + reviews done via sessions). */
  activity(days: number, now: Date = new Date()): DayActivity[] {
    const since = new Date(now.getTime() - days * 86_400_000);
    const rows = this.db
      .prepare(
        `SELECT started_at, items_done, accuracy FROM sessions WHERE started_at >= ? AND finished_at IS NOT NULL`,
      )
      .all(iso(since)) as { started_at: string; items_done: number; accuracy: number | null }[];
    const map = new Map<string, DayActivity>();
    for (let i = days - 1; i >= 0; i--) {
      const d = localDate(new Date(now.getTime() - i * 86_400_000));
      map.set(d, { day: d, items: 0, correct: 0 });
    }
    for (const r of rows) {
      const d = localDate(new Date(r.started_at));
      const e = map.get(d);
      if (e) {
        e.items += r.items_done;
        e.correct += Math.round((r.accuracy ?? 0) * r.items_done);
      }
    }
    return [...map.values()];
  }

  totals(): { sessions: number; minutes: number; attempts: number } {
    const s = this.db
      .prepare(
        `SELECT COUNT(*) AS sessions,
                COALESCE(SUM((julianday(finished_at) - julianday(started_at)) * 1440), 0) AS minutes
         FROM sessions WHERE finished_at IS NOT NULL`,
      )
      .get() as { sessions: number; minutes: number };
    const a = (this.db.prepare('SELECT COUNT(*) AS n FROM attempts').get() as { n: number }).n;
    return { sessions: s.sessions, minutes: Math.round(s.minutes), attempts: a };
  }

  // ── settings ───────────────────────────────────────────
  getSetting(key: string): string | undefined {
    return (this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)
      ?.value;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  /** Wipe learner progress, keep curriculum. */
  resetProgress(): void {
    this.db.transaction(() => {
      for (const t of ['attempts', 'mistakes', 'reviews', 'sessions', 'users']) this.db.exec(`DELETE FROM ${t}`);
      this.db.exec("DELETE FROM settings WHERE key NOT IN ('curriculum_hash')");
    })();
  }
}
