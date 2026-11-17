import type { Ctx } from '../practice/context.js';
import { withSession } from '../practice/session.js';
import { runDialogue } from '../practice/dialogue.js';
import { getAiClient, type ChatTurn } from '../ai/client.js';
import { chatTurn } from '../ai/coach.js';
import { ask, choose } from '../ui/ask.js';
import { blank, box, c, dim, notice, print } from '../ui/out.js';
import { t, type MessageKey } from '../i18n/index.js';
import { speak } from '../tts.js';
import { levelIndex } from '../engine/level.js';
import type { Dialogue } from '../types.js';

const MAX_TURNS = 30;

export async function chatCommand(ctx: Ctx, opts: { topic?: string; offline?: boolean; unit?: string }): Promise<void> {
  const ai = opts.offline ? null : getAiClient(ctx.config);
  if (ai) {
    const fellBack = await aiChat(ctx, ai, opts.topic);
    if (!fellBack) return;
  } else if (!opts.offline) {
    notice(t('ai.notice.no_key'));
  }
  await offlineChat(ctx, opts.unit);
}

/** Returns true if the AI failed and we should fall back to the offline simulation. */
async function aiChat(ctx: Ctx, ai: NonNullable<ReturnType<typeof getAiClient>>, topic?: string): Promise<boolean> {
  box(t('chat.aiIntro', { level: ctx.user.level, model: ai.model }), t('chat.title'), 'yellow');
  const history: ChatTurn[] = [
    { role: 'user', content: '(Start the conversation with one friendly, simple question.)' },
  ];
  let failed = false;
  await withSession(ctx, 'chat', async (s) => {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      print(dim(t('ai.thinking')));
      const res = await chatTurn(ai, ctx.user.level, ctx.locale, history, topic);
      if (!res.ok) {
        notice(t(`ai.notice.${res.reason}` as MessageKey));
        failed = turn === 0; // fall back only if the conversation never started
        return;
      }
      const { reply, corrections, encouragement } = res.data;
      if (turn > 0) {
        if (corrections.length) {
          box(
            corrections
              .slice(0, 3)
              .map((x) => `${c.red.strikethrough(x.original)} → ${c.green(x.better)}\n  ${dim(x.explanation)}`)
              .join('\n'),
            t('chat.corrections'),
            'magenta',
          );
        } else {
          print(c.green(t('chat.noCorrections')));
        }
        if (encouragement) print(dim(encouragement));
        s.record(corrections.length === 0, corrections.length === 0 ? 6 : 4);
      }
      history.push({ role: 'assistant', content: reply });
      blank();
      print(`${c.bold.yellow('🗣  ')}${c.bold(reply)}`);
      speak(reply);
      const mine = await ask(t('chat.you'));
      history.push({ role: 'user', content: mine });
    }
  });
  return failed;
}

async function offlineChat(ctx: Ctx, unitId?: string): Promise<void> {
  print(dim(t('chat.offlineIntro')));
  const units = ctx.store
    .units()
    .filter((u) => levelIndex(u.level) <= levelIndex(ctx.user.level))
    .reverse();
  const chosenId =
    unitId ??
    (await choose(
      t('learn.pickUnit'),
      units.map((u) => ({ name: `${u.level} · ${(JSON.parse(u.dialogue_json) as Dialogue).title}`, value: u.id })),
    ));
  const unit = ctx.store.unit(chosenId);
  if (!unit) return;
  await withSession(ctx, 'chat', async (s) => {
    await runDialogue(ctx, JSON.parse(unit.dialogue_json) as Dialogue, s);
  });
}
