import { describe, expect, it } from 'vitest';
import { daysBetween, displayStreak, localDate, updateStreak, xpFor } from '../src/engine/streak.js';

describe('streaks', () => {
  it('counts consecutive days and keeps the longest', () => {
    let s = { streak: 0, longest: 0, lastDate: null as string | null };
    s = updateStreak(s, '2026-03-01');
    s = updateStreak(s, '2026-03-02');
    s = updateStreak(s, '2026-03-02'); // same day: unchanged
    expect(s.streak).toBe(2);
    s = updateStreak(s, '2026-03-05'); // gap → reset
    expect(s.streak).toBe(1);
    expect(s.longest).toBe(2);
  });
  it('works across month and year boundaries', () => {
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
  });
  it('displays 0 once a day was missed', () => {
    const st = { streak: 5, longest: 5, lastDate: '2026-03-01' };
    expect(displayStreak(st, '2026-03-02')).toBe(5);
    expect(displayStreak(st, '2026-03-03')).toBe(0);
  });
  it('formats local dates', () => {
    expect(localDate(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
  it('XP: streak bonus capped at +50%, partial credit for typos', () => {
    expect(xpFor(10, true, false, 0)).toBe(10);
    expect(xpFor(10, true, false, 4)).toBe(12);
    expect(xpFor(10, true, false, 100)).toBe(15);
    expect(xpFor(10, true, true, 0)).toBe(7);
    expect(xpFor(10, false, false, 10)).toBe(1);
  });
});
