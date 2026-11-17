import type { Ctx } from '../practice/context.js';
import { withSession } from '../practice/session.js';
import { getAiClient } from '../ai/client.js';
import { explainTopic } from '../ai/coach.js';
import { gradeText, normalize } from '../engine/grading.js';
import { printGrammar, printWord } from '../practice/lesson.js';
import { runExercise } from '../practice/runner.js';
import { ask } from '../ui/ask.js';
import { bad, box, c, dim, heading, notice, ok, print, warn } from '../ui/out.js';
import { t, type MessageKey } from '../i18n/index.js';
import type { GrammarPoint, UnitRow } from '../types.js';

/** Score how well a grammar point matches a free-text query (offline search). */
export function scoreGrammar(q: string, g: GrammarPoint): number {
  const terms = normalize(q)
    .split(' ')
    .filter((w) => w.length > 1);
  if (!terms.length) return 0;
  const name = normalize(g.name);
  const body = normalize(`${g.rule} ${g.examples.join(' ')}`);
  let score = 0;
  for (const term of terms) {
    if (name.includes(term)) score += 3;
    else if (body.includes(term)) score += 1;
  }
  if (name.includes(normalize(q))) score += 5;
  return score / terms.length;
}

export async function explainCommand(ctx: Ctx, topicParts: string[], opts: { offline?: boolean }): Promise<void> {
  const topic = topicParts.join(' ').trim() || (await ask(t('explain.title')));
  heading(`${t('explain.title')}: ${topic}`);

  const ai = opts.offline ? null : getAiClient(ctx.config);
  if (ai) {
    print(dim(t('ai.thinking')));
    const res = await explainTopic(ai, ctx.user.level, ctx.locale, topic);
    if (res.ok) {
      const e = res.data;
      box(`${e.simple_english}\n\n${e.arabic}`, e.topic, 'magenta');
      box(
        e.examples
          .slice(0, 3)
          .map((x) => `• ${c.green(x)}`)
          .join('\n'),
        t('explain.examples'),
        'cyan',
      );
      await withSession(ctx, 'explain', async (s) => {
        heading(t('explain.drill'));
        for (const d of e.drill.slice(0, 3)) {
          print('', c.bold(d.question));
          const g = gradeText(await ask(t('ex.yourAnswer')), d.answer);
          if (g.correct) ok(t('ex.correct'));
          else bad(t('ex.wrong', { expected: d.answer }));
          s.record(g.correct, g.correct ? 5 : 1);
        }
      });
      return;
    }
    notice(t(`ai.notice.${res.reason}` as MessageKey));
  } else if (!opts.offline) {
    notice(t('ai.notice.no_key'));
  }
  await offlineExplain(ctx, topic);
}

async function offlineExplain(ctx: Ctx, topic: string): Promise<void> {
  let best: { unit: UnitRow; point: GrammarPoint; score: number } | null = null;
  for (const unit of ctx.store.units()) {
    for (const point of JSON.parse(unit.grammar_points_json) as GrammarPoint[]) {
      const score = scoreGrammar(topic, point);
      if (score > (best?.score ?? 0.9)) best = { unit, point, score };
    }
  }
  const words = ctx.store.searchVocab(topic.trim(), 5);

  if (!best && words.length === 0) {
    warn(t('explain.notFound', { q: topic }));
    return;
  }
  if (words.length) {
    heading(t('explain.vocabMatches'));
    for (const w of words) printWord(w);
  }
  if (best) {
    const found = best;
    printGrammar(ctx, [found.point]);
    print(dim(t('explain.fromUnit', { unit: `${found.unit.id} “${found.unit.title}”`, level: found.unit.level })));
    const drill = ctx.store
      .exercisesForUnit(found.unit.id)
      .filter((e) => ['gap_fill', 'mcq', 'word_order'].includes(e.type));
    if (drill.length) {
      heading(t('explain.drill'));
      await withSession(ctx, 'explain', async (s) => {
        for (const ex of drill) await runExercise(ctx, ex, s);
      });
    }
  }
}
