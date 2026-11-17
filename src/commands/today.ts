import type { Ctx } from '../practice/context.js';
import { withSession } from '../practice/session.js';
import { runDictationItem, runExercise, runReviewCard } from '../practice/runner.js';
import { runLesson } from '../practice/lesson.js';
import { runDialogue } from '../practice/dialogue.js';
import { yesNo } from '../ui/ask.js';
import { box, c, dim, heading, print } from '../ui/out.js';
import { t } from '../i18n/index.js';
import { displayStreak, localDate } from '../engine/streak.js';
import type { Dialogue, UnitRow } from '../types.js';

export interface DailyPlan {
  reviews: number;
  mistakes: number;
  unit: UnitRow | null;
  lessonExercises: number | undefined;
  dictation: boolean;
  dialogue: boolean;
}

/**
 * Budget the day (roughly): a review card ≈ 20 s, a fixed mistake ≈ 40 s,
 * a lesson ≈ its estimated minutes. Short budgets get a partial lesson.
 */
export function planDay(minutes: number, due: number, openMistakes: number, unit: UnitRow | null): DailyPlan {
  const reviews = Math.min(due, Math.max(5, Math.floor((minutes * 60 * 0.3) / 20)), 30);
  const mistakes = Math.min(openMistakes, minutes >= 15 ? 3 : 2);
  const used = (reviews * 20 + mistakes * 40) / 60;
  const left = minutes - used;
  const full = unit ? left >= unit.estimated_minutes * 0.8 : false;
  return {
    reviews,
    mistakes,
    unit,
    lessonExercises: unit && !full ? Math.max(2, Math.floor(left / 1.5)) : undefined,
    dictation: minutes >= 10,
    dialogue: minutes >= 20,
  };
}

export async function todayCommand(ctx: Ctx): Promise<void> {
  const { store, user } = ctx;
  const streak = displayStreak(
    { streak: user.streak_count, longest: user.longest_streak, lastDate: user.last_session_date },
    localDate(),
  );
  const unit = store.nextUnit(user.level);
  const plan = planDay(user.daily_minutes, store.countDue(), store.countOpenMistakes(), unit);

  heading(t('today.title'));
  print(t('today.greeting', { name: user.name, level: user.level, streak, minutes: user.daily_minutes }));
  if (user.last_session_date === localDate()) print(dim(t('today.alreadyDone')));

  const steps: string[] = [];
  if (plan.reviews) steps.push(t('today.stepReview', { n: plan.reviews }));
  if (plan.mistakes) steps.push(t('today.stepMistakes', { n: plan.mistakes }));
  steps.push(plan.unit ? t('today.stepLesson', { title: plan.unit.title }) : t('learn.allDone', { level: user.level }));
  if (plan.dictation) steps.push(t('today.stepDictation'));
  if (plan.dialogue && plan.unit) steps.push(t('today.stepDialogue'));
  box(steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), t('today.plan'), 'cyan');
  print(dim(t('prompt.quitHint')));
  if (!(await yesNo(t('today.start'), true))) return;

  await withSession(ctx, 'daily', async (session) => {
    if (plan.reviews) {
      heading(t('review.title'));
      for (const card of store.dueReviews(new Date(), plan.reviews)) await runReviewCard(ctx, card, session);
    }
    if (plan.mistakes) {
      heading(t('mistakes.title'));
      const open = store.openMistakes().filter((m) => m.exercise_id);
      for (const m of open.slice(0, plan.mistakes)) {
        const ex = store.exercise(m.exercise_id!);
        if (ex) await runExercise(ctx, ex, session);
      }
    }
    if (plan.unit) {
      await runLesson(ctx, plan.unit, session, { maxExercises: plan.lessonExercises, offerDialogue: false });
    }
    if (plan.dictation) {
      heading(t('dictation.title'));
      const items = store.dictationForLevel(ctx.user.level);
      if (items.length) {
        // Rotate deterministically through the level's sentences.
        const idx = (store.totals().sessions + new Date().getDate()) % items.length;
        await runDictationItem(ctx, items[idx]!, session);
      }
    }
    if (plan.dialogue && plan.unit) {
      await runDialogue(ctx, JSON.parse(plan.unit.dialogue_json) as Dialogue, session);
    }
  });
  print('', c.dim(t('app.bye')));
}
