/** Dates are local calendar days, `YYYY-MM-DD`. */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = toYmd.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export interface StreakState {
  streak: number;
  longest: number;
  lastDate: string | null;
}

export function updateStreak(state: StreakState, today: string): StreakState & { changed: boolean } {
  if (state.lastDate === today) return { ...state, changed: false };
  const gap = state.lastDate ? daysBetween(state.lastDate, today) : Infinity;
  const streak = gap === 1 ? state.streak + 1 : 1;
  return { streak, longest: Math.max(state.longest, streak), lastDate: today, changed: true };
}

/** Streak shown to the user: 0 if they missed yesterday and haven't studied today. */
export function displayStreak(state: StreakState, today: string): number {
  if (!state.lastDate) return 0;
  const gap = daysBetween(state.lastDate, today);
  return gap <= 1 ? state.streak : 0;
}

/** XP for a correct answer, with a capped streak bonus (+5% per streak day, max +50%). */
export function xpFor(points: number, correct: boolean, almost: boolean, streak: number): number {
  if (!correct) return 1; // effort still counts a little
  const base = almost ? Math.ceil(points * 0.7) : points;
  const bonus = Math.min(0.5, streak * 0.05);
  return Math.round(base * (1 + bonus));
}
