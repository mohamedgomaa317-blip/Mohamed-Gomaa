import type { Ctx } from './context.js';
import type { Session } from './session.js';
import type { Dialogue, GrammarPoint, UnitRow, VocabRow } from '../types.js';
import { runExercise } from './runner.js';
import { runDialogue } from './dialogue.js';
import { choose, pause, yesNo } from '../ui/ask.js';
import { bad, blank, box, c, dim, heading, ok, print } from '../ui/out.js';
import { t } from '../i18n/index.js';
import { shuffle } from '../engine/grading.js';
import { UNIT_PASS_MARK } from '../engine/level.js';
import { speak } from '../tts.js';

export function printGrammar(ctx: Ctx, points: GrammarPoint[]): void {
  for (const g of points) {
    const body = [
      c.bold(g.rule),
      ...(ctx.locale === 'ar' ? ['', g.ar] : []),
      '',
      ...g.examples.map((e) => `  • ${c.green(e)}`),
    ].join('\n');
    box(body, g.name, 'magenta');
  }
}

export function printWord(v: VocabRow): void {
  print(`${c.bold.cyan(v.word)}  ${dim(v.ipa)}  —  ${c.green(v.translation)}`);
  print(dim(`   “${v.example}”`));
}

/** Recognition quiz: pick the Arabic meaning. No DB writes — it is a warm-up, not an attempt. */
async function quickCheck(vocab: VocabRow[]): Promise<void> {
  for (const v of shuffle(vocab).slice(0, 3)) {
    const distractors = shuffle(vocab.filter((o) => o.id !== v.id)).slice(0, 3);
    const answer = await choose(
      t('learn.quickCheck', { word: v.word }),
      shuffle([v, ...distractors]).map((o) => ({ name: o.translation, value: o.id })),
    );
    if (answer === v.id) ok(t('ex.correct'));
    else bad(t('ex.wrong', { expected: v.translation }));
  }
}

export interface LessonOptions {
  /** Max exercises this time (for short daily budgets). Undefined = all. */
  maxExercises?: number;
  /** Offer the dialogue at the end. */
  offerDialogue?: boolean;
}

/**
 * A unit lesson: grammar → new words (added to SRS) → exercises not yet answered
 * correctly → optional dialogue. Intro parts are shown once per unit.
 */
export async function runLesson(ctx: Ctx, unit: UnitRow, session: Session, opts: LessonOptions = {}): Promise<void> {
  const introKey = `intro:${unit.id}`;
  const firstTime = ctx.store.getSetting(introKey) !== 'done';
  box(
    `${c.bold(unit.title)}\n${dim(`${unit.level} · ${unit.theme} · ~${unit.estimated_minutes} min`)}`,
    t('learn.title'),
    'cyan',
  );

  if (firstTime) {
    heading(t('learn.grammar'));
    printGrammar(ctx, JSON.parse(unit.grammar_points_json) as GrammarPoint[]);
    await pause();

    heading(t('learn.vocab'));
    const vocab = ctx.store.vocabForUnit(unit);
    for (const v of vocab) {
      printWord(v);
      speak(v.word);
      // First SRS review tomorrow; today's exercises are the first exposure.
      ctx.store.addToReviews(v.id, new Date(), 20 * 3_600_000);
    }
    await pause();
    if (vocab.length >= 4) await quickCheck(vocab);
    ctx.store.setSetting(introKey, 'done');
  }

  heading(t('learn.practice'));
  const all = ctx.store.exercisesForUnit(unit.id);
  const progress = ctx.store.unitProgress(unit);
  // Exercises whose latest attempt is not correct come first; on review passes, all of them.
  const lastCorrect = new Set(
    (
      ctx.db
        .prepare(
          `SELECT a.exercise_id FROM attempts a JOIN (SELECT exercise_id, MAX(id) mid FROM attempts WHERE unit_id = ? GROUP BY exercise_id) l
           ON l.mid = a.id WHERE a.correct = 1`,
        )
        .all(unit.id) as { exercise_id: string }[]
    ).map((r) => r.exercise_id),
  );
  let todo = progress.passed ? all : all.filter((e) => !lastCorrect.has(e.id));
  if (opts.maxExercises !== undefined) todo = todo.slice(0, opts.maxExercises);
  for (const ex of todo) await runExercise(ctx, ex, session);

  const after = ctx.store.unitProgress(unit);
  blank();
  print(
    c.bold(
      t('learn.unitResult', {
        pct: `${Math.round(after.accuracy * 100)}%`,
        status: after.passed ? t('learn.passed') : t('learn.notPassed', { mark: `${UNIT_PASS_MARK * 100}%` }),
      }),
    ),
  );

  if (opts.offerDialogue !== false && (await yesNo(t('learn.practiseDialogue'), true))) {
    await runDialogue(ctx, JSON.parse(unit.dialogue_json) as Dialogue, session);
  }
}
