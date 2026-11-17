import type { Ctx } from './context.js';
import type { Session } from './session.js';
import type { Dialogue } from '../types.js';
import { keywordCoverage } from '../engine/grading.js';
import { ask } from '../ui/ask.js';
import { blank, box, c, dim, ok, print, warn } from '../ui/out.js';
import { t } from '../i18n/index.js';
import { speak } from '../tts.js';

/**
 * Offline conversation simulation: the partner follows a scripted dialogue,
 * the learner replies freely, and each reply is checked for the key ideas
 * (keyword groups) and compared with a natural model reply.
 */
export async function runDialogue(
  _ctx: Ctx,
  dialogue: Dialogue,
  session: Session | null,
): Promise<{ good: number; total: number }> {
  box(`${c.bold(dialogue.title)}\n${dim(t('chat.scene', { setting: dialogue.setting }))}`, t('chat.title'), 'yellow');
  let good = 0;
  for (const turn of dialogue.turns) {
    blank();
    print(`${c.bold.yellow('🗣  ')}${c.bold(turn.bot)}`);
    speak(turn.bot);
    const reply = await ask(t('chat.you'));
    const cov = keywordCoverage(reply, turn.expect.keywords);
    const longEnough = reply.split(/\s+/).filter(Boolean).length >= 3;
    const isGood = cov >= 0.5 && longEnough;
    if (isGood) {
      good++;
      ok(t('chat.goodReply'));
    } else {
      const missing = turn.expect.keywords
        .filter((k) => keywordCoverage(reply, [k]) === 0)
        .map((k) => k.split('|')[0]!);
      warn(t('chat.tryInclude', { words: missing.join(', ') || '…' }));
    }
    print(dim(t('chat.natural')) + ' ' + c.green(turn.expect.sample));
    session?.record(isGood, isGood ? 6 : 2);
  }
  blank();
  print(c.bold(t('chat.summary', { good, total: dialogue.turns.length })));
  return { good, total: dialogue.turns.length };
}
