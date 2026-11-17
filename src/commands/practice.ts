import type { Ctx } from '../practice/context.js';
import { withSession } from '../practice/session.js';
import { runDictationItem, runExercise, runReviewCard } from '../practice/runner.js';
import { runLesson } from '../practice/lesson.js';
import { choose, yesNo } from '../ui/ask.js';
import { bad, c, dim, heading, ok, print, table } from '../ui/out.js';
import { t } from '../i18n/index.js';
import { shuffle } from '../engine/grading.js';
import { isLevel, parseLevel } from '../engine/level.js';
import type { Level } from '../types.js';

export async function reviewCommand(ctx: Ctx, opts: { limit?: number }): Promise<void> {
  const due = ctx.store.dueReviews(new Date(), opts.limit ?? 30);
  heading(t('review.title'));
  if (due.length === 0) {
    print(t('review.none'));
    return;
  }
  print(dim(t('review.count', { n: ctx.store.countDue() })));
  await withSession(ctx, 'review', async (s) => {
    for (const card of due) await runReviewCard(ctx, card, s);
  });
}

export function listUnits(ctx: Ctx, level?: Level): void {
  const rows = ctx.store.units(level).map((u) => {
    const p = ctx.store.unitProgress(u);
    const mark = p.passed ? c.green('✔') : p.attempted ? c.yellow('…') : dim('·');
    return [mark, u.id, u.level, u.title, u.theme, `${Math.round(p.accuracy * 100)}%`];
  });
  print(table(['', 'id', 'CEFR', t('learn.listHeader'), '', '%'], rows));
}

export async function learnCommand(
  ctx: Ctx,
  unitArg: string | undefined,
  opts: { list?: boolean; level?: string },
): Promise<void> {
  const level = opts.level ? parseLevel(opts.level) : undefined;
  if (opts.list) {
    listUnits(ctx, level);
    return;
  }
  let unit = unitArg ? ctx.store.unit(unitArg.toLowerCase()) : undefined;
  if (unitArg && !unit) {
    bad(t('learn.unknownUnit', { id: unitArg }));
    return;
  }
  if (!unit && level) {
    const id = await choose(
      t('learn.pickUnit'),
      ctx.store.units(level).map((u) => ({ name: `${u.id}  ${u.title}`, value: u.id })),
    );
    unit = ctx.store.unit(id);
  }
  if (!unit) unit = ctx.store.nextUnit(ctx.user.level) ?? undefined;
  if (!unit) {
    print(t('learn.allDone', { level: ctx.user.level }));
    return;
  }
  const chosen = unit;
  await withSession(ctx, 'lesson', (s) => runLesson(ctx, chosen, s));
}

export async function dictationCommand(ctx: Ctx, opts: { count?: number; level?: string }): Promise<void> {
  const level = opts.level && isLevel(opts.level) ? parseLevel(opts.level) : ctx.user.level;
  const items = shuffle(ctx.store.dictationForLevel(level)).slice(0, opts.count ?? 3);
  heading(t('dictation.title'));
  await withSession(ctx, 'dictation', async (s) => {
    for (const item of items) await runDictationItem(ctx, item, s);
  });
}

export async function mistakesCommand(ctx: Ctx, opts: { practice?: boolean; clear?: boolean }): Promise<void> {
  const open = ctx.store.openMistakes();
  heading(t('mistakes.title'));
  if (open.length === 0) {
    ok(t('mistakes.none'));
    return;
  }
  if (opts.clear) {
    if (await yesNo(t('mistakes.clearConfirm', { n: open.length }), false)) {
      for (const m of open) ctx.store.resolveMistake(m.id);
      ok(t('mistakes.cleared'));
    }
    return;
  }
  if (!opts.practice) {
    const cut = (s: string, n = 40): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
    print(
      table(
        ['#', t('mistakes.q'), t('mistakes.given'), t('mistakes.answer')],
        open.map((m) => [
          m.id,
          cut(m.question),
          c.red(cut(m.given_answer, 25)),
          c.green(cut(m.correct_answer.split('|')[0]!, 30)),
        ]),
      ),
    );
    print(dim('eng mistakes --practice'));
    return;
  }
  await withSession(ctx, 'mistakes', async (s) => {
    for (const m of open) {
      if (m.exercise_id) {
        const ex = ctx.store.exercise(m.exercise_id);
        if (!ex) continue;
        const r = await runExercise(ctx, ex, s);
        if (r.correct) ok(t('mistakes.fixed'));
      } else {
        // Dictation mistakes: retype the sentence.
        const sentence = m.correct_answer;
        print('', c.bold(m.question));
        const item = { id: `m${m.id}`, level: ctx.user.level, unit_id: '', sentence, hidden_words_json: '[]' };
        if (await runDictationItem(ctx, item, s)) {
          ctx.store.resolveMistake(m.id);
          ok(t('mistakes.fixed'));
        }
      }
    }
  });
}
