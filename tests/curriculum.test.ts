import { describe, expect, it } from 'vitest';
import { CURRICULUM } from '../src/content/curriculum.js';
import {
  gradeMcq,
  gradeText,
  gradeWordOrder,
  keywordCoverage,
  normalize,
  splitAnswers,
} from '../src/engine/grading.js';
import { LEVELS } from '../src/types.js';
import { planDay } from '../src/commands/today.js';
import { scoreGrammar } from '../src/commands/explain.js';

/** Content integrity: every item must be answerable by our own grader. */
describe('curriculum integrity', () => {
  it('has 3 units for every CEFR level and unique ids', () => {
    for (const l of LEVELS) expect(CURRICULUM.filter((u) => u.level === l)).toHaveLength(3);
    const ids = CURRICULUM.flatMap((u) => [
      u.id,
      ...u.exercises.map((e) => e.id),
      ...u.vocab.map((v) => v.id),
      ...u.dictation.map((d) => d.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every unit covers all six exercise types', () => {
    for (const u of CURRICULUM) {
      expect(new Set(u.exercises.map((e) => e.type))).toEqual(
        new Set(['mcq', 'gap_fill', 'word_order', 'translate', 'dictation', 'speaking']),
      );
    }
  });

  for (const u of CURRICULUM) {
    describe(u.id, () => {
      it('MCQ answers are among the options', () => {
        for (const e of u.exercises.filter((x) => x.type === 'mcq')) {
          expect(gradeMcq(e.answer, e.options!, e.answer).correct, e.id).toBe(true);
          expect(
            e.options!.filter((o) => normalize(o) === normalize(e.answer)),
            e.id,
          ).toHaveLength(1);
        }
      });

      it('word-order tokens rebuild every accepted answer', () => {
        for (const e of u.exercises.filter((x) => x.type === 'word_order')) {
          const tokens = e
            .options!.flatMap((tok) => normalize(tok).split(' '))
            .filter(Boolean)
            .sort();
          const first = splitAnswers(e.answer)[0]!;
          expect(normalize(first).split(' ').sort(), e.id).toEqual(tokens);
          expect(gradeWordOrder(first, e.answer).correct).toBe(true);
        }
      });

      it('text answers grade as correct against themselves', () => {
        for (const e of u.exercises.filter((x) => ['gap_fill', 'translate'].includes(x.type))) {
          for (const a of splitAnswers(e.answer)) expect(gradeText(a, e.answer).correct, `${e.id}: ${a}`).toBe(true);
        }
      });

      it('model answers pass their own speaking / dialogue checks', () => {
        for (const e of u.exercises.filter((x) => x.type === 'speaking')) {
          expect(keywordCoverage(e.answer, e.options!), e.id).toBeGreaterThanOrEqual(0.5);
        }
        for (const turn of u.dialogue.turns) {
          expect(keywordCoverage(turn.expect.sample, turn.expect.keywords), turn.expect.sample).toBeGreaterThanOrEqual(
            0.5,
          );
        }
      });

      it('dictation hidden words appear in their sentences', () => {
        for (const d of u.dictation) {
          for (const h of d.hidden) expect(d.sentence.toLowerCase(), d.id).toContain(h.toLowerCase());
        }
        for (const e of u.exercises.filter((x) => x.type === 'dictation')) expect(e.prompt).toBe(e.answer);
      });

      it('vocab has translations and examples using the word', () => {
        for (const v of u.vocab) {
          expect(v.translation.length).toBeGreaterThan(0);
          const head = v.word.split(' ')[0]!.toLowerCase().slice(0, 4);
          expect(v.example.toLowerCase(), v.id).toContain(head);
        }
      });
    });
  }
});

describe('daily planner', () => {
  const unit = { estimated_minutes: 14 } as never;
  it('fits a full lesson in 20 minutes', () => {
    const p = planDay(20, 3, 1, unit);
    expect(p.reviews).toBe(3);
    expect(p.lessonExercises).toBeUndefined();
    expect(p.dialogue).toBe(true);
  });
  it('short budgets get a partial lesson and capped reviews', () => {
    const p = planDay(10, 100, 10, unit);
    expect(p.reviews).toBeLessThanOrEqual(9);
    expect(p.lessonExercises).toBeGreaterThanOrEqual(2);
    expect(p.mistakes).toBe(2);
  });
});

describe('offline explain search', () => {
  it('finds grammar points by name', () => {
    const all = CURRICULUM.flatMap((u) => u.grammar);
    const best = all.reduce((a, b) =>
      scoreGrammar('present perfect', b) > scoreGrammar('present perfect', a) ? b : a,
    );
    expect(best.name).toMatch(/Present perfect/);
  });
});
