/**
 * Spaced repetition — a modernised SM-2.
 *
 * Ratings (what the learner presses):
 *   0 = Again (forgot)   1 = Hard   2 = Good   3 = Easy
 * They map to SM-2 quality 1 / 3 / 4 / 5.
 */
export type Rating = 0 | 1 | 2 | 3;

export interface CardState {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
}

export interface ScheduleResult extends CardState {
  dueAt: Date;
  lastRating: Rating;
}

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const DEFAULT_EASE = 2.5;
/** A lapsed card comes back after 10 minutes so it can be re-seen in the same session. */
export const RELEARN_MINUTES = 10;
/** Hard upper bound so a card is never pushed out of sight for years. */
export const MAX_INTERVAL_DAYS = 365;

const QUALITY: Record<Rating, number> = { 0: 1, 1: 3, 2: 4, 3: 5 };
const DAY_MS = 86_400_000;

export function newCard(): CardState {
  return { intervalDays: 0, easeFactor: DEFAULT_EASE, repetitions: 0, lapses: 0 };
}

export function nextEase(ease: number, rating: Rating): number {
  const q = QUALITY[rating];
  const updated = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return Math.min(MAX_EASE, Math.max(MIN_EASE, round2(updated)));
}

export function schedule(card: CardState, rating: Rating, now: Date = new Date()): ScheduleResult {
  const easeFactor = nextEase(card.easeFactor, rating);

  if (rating === 0) {
    return {
      intervalDays: 0,
      easeFactor,
      repetitions: 0,
      lapses: card.lapses + 1,
      dueAt: new Date(now.getTime() + RELEARN_MINUTES * 60_000),
      lastRating: rating,
    };
  }

  const repetitions = card.repetitions + 1;
  let interval: number;
  if (repetitions === 1) {
    interval = rating === 3 ? 3 : 1;
  } else if (repetitions === 2) {
    interval = rating === 1 ? 3 : rating === 3 ? 8 : 6;
  } else {
    const base = Math.max(1, card.intervalDays);
    const multiplier = rating === 1 ? 1.2 : rating === 3 ? easeFactor * 1.3 : easeFactor;
    interval = Math.max(base + 1, Math.round(base * multiplier));
  }
  interval = Math.min(MAX_INTERVAL_DAYS, interval);

  return {
    intervalDays: interval,
    easeFactor,
    repetitions,
    lapses: card.lapses,
    dueAt: new Date(now.getTime() + interval * DAY_MS),
    lastRating: rating,
  };
}

/** Map an auto-graded typed answer to a rating. */
export function ratingFromGrade(correct: boolean, almost: boolean, timeMs: number): Rating {
  if (!correct && !almost) return 0;
  if (almost) return 1;
  if (timeMs > 15_000) return 1;
  if (timeMs < 4_000) return 3;
  return 2;
}

/** A card counts as "mastered" once it has survived 3+ successful reviews and a ≥ 3-week interval. */
export function isMastered(card: Pick<CardState, 'repetitions' | 'intervalDays'>): boolean {
  return card.repetitions >= 3 && card.intervalDays >= 21;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
