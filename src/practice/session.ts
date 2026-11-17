import type { Ctx } from './context.js';
import { checkPromotion, nextLevel, levelIndex } from '../engine/level.js';
import { box, c, print } from '../ui/out.js';
import { t } from '../i18n/index.js';
import { QuitSession, isPromptExit } from '../ui/ask.js';
import type { Level } from '../types.js';

export interface SessionSummary {
  items: number;
  correct: number;
  xp: number;
  streak: number;
  levelUp: Level | null;
}

/** Tracks one practice session and persists it on finish. */
export class Session {
  readonly id: number;
  items = 0;
  correct = 0;
  xp = 0;
  private finished = false;

  constructor(
    private readonly ctx: Ctx,
    readonly mode: string,
  ) {
    this.id = ctx.store.startSession(mode);
  }

  record(correct: boolean, xp: number): void {
    this.items++;
    if (correct) this.correct++;
    this.xp += xp;
  }

  get accuracy(): number | null {
    return this.items ? this.correct / this.items : null;
  }

  finish(): SessionSummary {
    if (this.finished) throw new Error('session already finished');
    this.finished = true;
    const { store } = this.ctx;
    store.finishSession(this.id, { xp: this.xp, accuracy: this.accuracy, items: this.items });
    store.addXp(this.xp);
    const streak = this.items > 0 ? store.touchStreak().streak : (store.getUser()?.streak_count ?? 0);
    const levelUp = this.items > 0 ? maybePromote(this.ctx) : null;
    return { items: this.items, correct: this.correct, xp: this.xp, streak, levelUp };
  }
}

/** Promote the learner when the current level is complete. Returns the new level, if any. */
export function maybePromote(ctx: Ctx): Level | null {
  const user = ctx.store.getUser();
  if (!user) return null;
  const check = checkPromotion(ctx.store.levelStats(user.level));
  const up = nextLevel(user.level);
  if (!check.eligible || !up) return null;
  ctx.store.updateUserFields({ level: up });
  ctx.user = { ...ctx.user, level: up };
  return up;
}

export function printSummary(ctx: Ctx, s: SessionSummary): void {
  if (s.items === 0) {
    print(c.dim(t('summary.nothing')));
    return;
  }
  const lines = [
    t('summary.items', { n: s.items }),
    t('summary.accuracy', { pct: `${Math.round((s.correct / s.items) * 100)}%` }),
    t('summary.xp', { xp: s.xp }),
    t('summary.streak', { n: s.streak }),
    t('summary.dueTomorrow', { n: ctx.store.countDue(new Date(Date.now() + 86_400_000)) }),
  ];
  if (s.levelUp) {
    lines.push('', c.bold.green(t('summary.levelUp', { level: s.levelUp })));
    const user = ctx.store.getUser();
    if (user && levelIndex(s.levelUp) >= levelIndex(user.target_level)) {
      lines.push(c.bold.yellow(t('summary.targetReached', { level: s.levelUp })));
    }
  }
  box(lines.join('\n'), t('summary.title'), 'green');
}

/**
 * Run a body inside a session. `:q` and Ctrl+C both end the session cleanly:
 * whatever was practised is saved and summarised.
 */
export async function withSession(
  ctx: Ctx,
  mode: string,
  body: (s: Session) => Promise<void>,
): Promise<SessionSummary> {
  const session = new Session(ctx, mode);
  try {
    await body(session);
  } catch (err) {
    if (!(err instanceof QuitSession) && !isPromptExit(err)) {
      session.finish();
      throw err;
    }
    print(c.cyan(t('app.saved')));
  }
  const summary = session.finish();
  printSummary(ctx, summary);
  return summary;
}
