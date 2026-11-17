import { describe, expect, it } from 'vitest';
import {
  isMastered,
  MIN_EASE,
  newCard,
  nextEase,
  ratingFromGrade,
  RELEARN_MINUTES,
  schedule,
} from '../src/engine/srs.js';

const NOW = new Date('2026-01-01T10:00:00Z');
const days = (d: Date) => (d.getTime() - NOW.getTime()) / 86_400_000;

describe('SM-2 scheduler', () => {
  it('first good review → 1 day, second → 6 days, then grows by ease', () => {
    let c = schedule(newCard(), 2, NOW);
    expect(c.intervalDays).toBe(1);
    expect(days(c.dueAt)).toBe(1);
    c = schedule(c, 2, NOW);
    expect(c.intervalDays).toBe(6);
    c = schedule(c, 2, NOW);
    expect(c.intervalDays).toBe(Math.round(6 * c.easeFactor));
    expect(c.repetitions).toBe(3);
  });

  it('easy jumps further than good; hard grows slower', () => {
    const base = schedule(schedule(newCard(), 2, NOW), 2, NOW); // 6 days
    expect(schedule(base, 3, NOW).intervalDays).toBeGreaterThan(schedule(base, 2, NOW).intervalDays);
    expect(schedule(base, 1, NOW).intervalDays).toBeLessThan(schedule(base, 2, NOW).intervalDays);
    expect(schedule(base, 1, NOW).intervalDays).toBeGreaterThan(base.intervalDays);
  });

  it('a lapse resets repetitions, counts the lapse and relearns in minutes', () => {
    const learned = schedule(schedule(schedule(newCard(), 2, NOW), 2, NOW), 2, NOW);
    const lapsed = schedule(learned, 0, NOW);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.intervalDays).toBe(0);
    expect(lapsed.dueAt.getTime() - NOW.getTime()).toBe(RELEARN_MINUTES * 60_000);
    expect(lapsed.easeFactor).toBeLessThan(learned.easeFactor);
  });

  it('ease never drops below the floor', () => {
    let e = 2.5;
    for (let i = 0; i < 20; i++) e = nextEase(e, 0);
    expect(e).toBe(MIN_EASE);
  });

  it('intervals are capped at one year', () => {
    let c = schedule(newCard(), 3, NOW);
    for (let i = 0; i < 20; i++) c = schedule(c, 3, NOW);
    expect(c.intervalDays).toBeLessThanOrEqual(365);
  });

  it('maps typed answers to ratings', () => {
    expect(ratingFromGrade(false, false, 1000)).toBe(0);
    expect(ratingFromGrade(true, true, 1000)).toBe(1);
    expect(ratingFromGrade(true, false, 2000)).toBe(3);
    expect(ratingFromGrade(true, false, 8000)).toBe(2);
    expect(ratingFromGrade(true, false, 30_000)).toBe(1);
  });

  it('mastery needs 3+ reps and a 3-week interval', () => {
    expect(isMastered({ repetitions: 3, intervalDays: 21 })).toBe(true);
    expect(isMastered({ repetitions: 2, intervalDays: 40 })).toBe(false);
  });
});
