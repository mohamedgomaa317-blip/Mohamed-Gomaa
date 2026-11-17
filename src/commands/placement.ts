import type { Ctx } from '../practice/context.js';
import { placementResult, startPlacement, stepPlacement, PLACEMENT_BLOCK } from '../engine/level.js';
import { gradeMcq, gradeText, shuffle } from '../engine/grading.js';
import { choose, ask } from '../ui/ask.js';
import { box, c, dim, heading, ok, print, bad } from '../ui/out.js';
import { t } from '../i18n/index.js';
import type { Level } from '../types.js';
import type { Store } from '../db/store.js';

/** Adaptive placement test. Placement answers are not stored as attempts (they would skew unit progress). */
export async function runPlacement(store: Store): Promise<Level> {
  heading(t('placement.title'));
  print(dim(t('placement.intro')));
  let state = startPlacement('A2');
  while (!state.done) {
    const level = state.current;
    print('', c.bold.magenta(t('placement.block', { level })));
    const pool = shuffle(store.exercisesByLevel(level, ['mcq', 'gap_fill'])).slice(0, PLACEMENT_BLOCK);
    let correct = 0;
    for (const ex of pool) {
      print('', c.bold(ex.prompt));
      let right: boolean;
      if (ex.type === 'mcq') {
        const options = JSON.parse(ex.options_json ?? '[]') as string[];
        const given = await choose(
          t('ex.yourAnswer'),
          shuffle(options).map((o) => ({ name: o, value: o })),
        );
        right = gradeMcq(given, options, ex.answer).correct;
      } else {
        right = gradeText(await ask(t('ex.yourAnswer')), ex.answer).correct;
      }
      if (right) {
        correct++;
        ok(t('ex.correct'));
      } else bad(t('ex.wrong', { expected: ex.answer.split('|')[0]! }));
    }
    print(dim(t('placement.score', { correct, total: pool.length, level })));
    state = stepPlacement(state, correct);
  }
  const result = placementResult(state);
  box(c.bold(t('placement.result', { level: t(`level.${result}`) })), t('placement.title'), 'green');
  return result;
}

export async function placementCommand(ctx: Ctx): Promise<void> {
  const level = await runPlacement(ctx.store);
  ctx.store.updateUserFields({ level });
  ctx.store.setSetting('placement_done', new Date().toISOString());
}
