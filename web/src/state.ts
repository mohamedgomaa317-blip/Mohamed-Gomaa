/**
 * Learner state for the web app: one JSON document, saved to the learner's
 * private claude.ai store (and cached in localStorage). Bounded in size:
 * per-exercise latest results, per-word SRS cards, per-day aggregates
 * (last 90 days) and at most 200 open mistakes.
 */
import { CURRICULUM } from '../../src/content/curriculum.js';
import { schedule, newCard, type Rating } from '../../src/engine/srs.js';
import { checkPromotion, nextLevel, UNIT_PASS_MARK, type LevelStats } from '../../src/engine/level.js';
import { displayStreak, localDate, updateStreak } from '../../src/engine/streak.js';
import { LEVELS, type ExerciseSeed, type Level, type Locale, type UnitSeed, type VocabItem } from '../../src/types.js';
import { cloudStore, readLocal, writeLocal, type CloudStore } from './platform.js';

// ── curriculum indexes ────────────────────────────────────────
export type Ex = ExerciseSeed & { level: Level; unitId: string };
export type Word = VocabItem & { level: Level; unitId: string };
export const UNITS: UnitSeed[] = CURRICULUM;
export const UNIT = new Map(UNITS.map((u) => [u.id, u]));
export const EX = new Map<string, Ex>(
  UNITS.flatMap((u) => u.exercises.map((e) => [e.id, { ...e, level: u.level, unitId: u.id }])),
);
export const WORD = new Map<string, Word>(
  UNITS.flatMap((u) => u.vocab.map((v) => [v.id, { ...v, level: u.level, unitId: u.id }])),
);

// ── state shape ───────────────────────────────────────────────
export interface Card {
  due: string;
  iv: number;
  ef: number;
  reps: number;
  lapses: number;
}
export interface Mistake {
  id: string;
  exId: string | null;
  q: string;
  given: string;
  ans: string;
  expl: string;
  at: string;
}
export interface Day {
  items: number;
  correct: number;
  xp: number;
  /** exercise type → [attempts, correct] */
  t: Record<string, [number, number]>;
}
export interface Profile {
  name: string;
  level: Level;
  target: Level;
  minutes: number;
  locale: Locale;
  createdAt: string;
}
export interface State {
  v: 1;
  updatedAt: string;
  profile: Profile | null;
  xp: number;
  streak: { count: number; longest: number; last: string | null };
  cards: Record<string, Card>;
  /** exercise id → latest result (1/0) and attempt count */
  ex: Record<string, [number, number]>;
  mistakes: Mistake[];
  intro: Record<string, 1>;
  days: Record<string, Day>;
}

export function emptyState(): State {
  return {
    v: 1,
    updatedAt: new Date(0).toISOString(),
    profile: null,
    xp: 0,
    streak: { count: 0, longest: 0, last: null },
    cards: {},
    ex: {},
    mistakes: [],
    intro: {},
    days: {},
  };
}

function isState(x: unknown): x is State {
  return !!x && typeof x === 'object' && (x as State).v === 1 && typeof (x as State).cards === 'object';
}

// ── persistence ───────────────────────────────────────────────
export let S: State = emptyState();
let cloud: CloudStore | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
export type SyncStatus = 'local' | 'cloud' | 'saving';
let syncListener: (s: SyncStatus) => void = () => undefined;
export function onSync(fn: (s: SyncStatus) => void): void {
  syncListener = fn;
}

/** Instant local load; the cloud copy (if newer) replaces it when it arrives. */
export function loadLocal(): void {
  const local = readLocal<State>();
  if (isState(local)) S = { ...emptyState(), ...local };
}

export async function connectCloud(): Promise<boolean> {
  cloud = await cloudStore().catch(() => null);
  if (!cloud) {
    syncListener('local');
    return false;
  }
  try {
    const remote = await cloud.load();
    if (isState(remote) && remote.updatedAt > S.updatedAt) {
      S = { ...emptyState(), ...remote };
      writeLocal(S);
      syncListener('cloud');
      return true; // caller re-renders
    }
    if (S.profile) await cloud.save(S as unknown as Record<string, unknown>);
    syncListener('cloud');
  } catch {
    syncListener('local');
  }
  return false;
}

export function save(): void {
  S.updatedAt = new Date().toISOString();
  pruneDays();
  writeLocal(S);
  if (!cloud) return;
  syncListener('saving');
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void cloud!.save(S as unknown as Record<string, unknown>).then(() => syncListener('cloud'));
  }, 900);
}

function pruneDays(): void {
  const keys = Object.keys(S.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 90))) delete S.days[k];
  if (S.mistakes.length > 200) S.mistakes = S.mistakes.slice(-200);
}

// ── progress queries ──────────────────────────────────────────
export function unitProgress(u: UnitSeed): { accuracy: number; attempted: number; passed: boolean } {
  let correct = 0;
  let attempted = 0;
  for (const e of u.exercises) {
    const r = S.ex[e.id];
    if (r) {
      attempted++;
      correct += r[0];
    }
  }
  const accuracy = u.exercises.length ? correct / u.exercises.length : 0;
  return { accuracy, attempted, passed: accuracy >= UNIT_PASS_MARK };
}

export function nextUnit(level: Level): UnitSeed | null {
  return UNITS.find((u) => u.level === level && !unitProgress(u).passed) ?? null;
}

export function levelStats(level: Level): LevelStats {
  const units = UNITS.filter((u) => u.level === level);
  const words = units.flatMap((u) => u.vocab);
  return {
    unitsTotal: units.length,
    unitsPassed: units.filter((u) => unitProgress(u).passed).length,
    vocabTotal: words.length,
    vocabKnown: words.filter((w) => (S.cards[w.id]?.reps ?? 0) >= 2).length,
  };
}

export function dueCards(now = new Date()): string[] {
  const iso = now.toISOString();
  return Object.entries(S.cards)
    .filter(([, c]) => c.due <= iso)
    .sort((a, b) => (a[1].due < b[1].due ? -1 : 1))
    .map(([id]) => id);
}

export function vocabCounts(): { learning: number; known: number; mastered: number } {
  const cards = Object.values(S.cards);
  return {
    learning: cards.length,
    known: cards.filter((c) => c.reps >= 2).length,
    mastered: cards.filter((c) => c.reps >= 3 && c.iv >= 21).length,
  };
}

export function streakNow(): number {
  return displayStreak({ streak: S.streak.count, longest: S.streak.longest, lastDate: S.streak.last }, localDate());
}

export function openMistakes(): Mistake[] {
  return S.mistakes;
}

/** Accuracy per exercise type over [fromDaysAgo, toDaysAgo). */
export function typeAccuracy(fromDaysAgo: number, toDaysAgo: number): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const now = Date.now();
  for (let i = toDaysAgo; i < fromDaysAgo; i++) {
    const d = S.days[localDate(new Date(now - i * 86_400_000))];
    if (!d) continue;
    for (const [ty, [n, c]] of Object.entries(d.t)) {
      const cur = (out[ty] ??= [0, 0]);
      cur[0] += n;
      cur[1] += c;
    }
  }
  return out;
}

// ── mutations ─────────────────────────────────────────────────
function today(): Day {
  return (S.days[localDate()] ??= { items: 0, correct: 0, xp: 0, t: {} });
}

/** Count an item for today's stats, streak and XP. */
export function countItem(type: string, correct: boolean, xp: number): void {
  const d = today();
  d.items++;
  if (correct) d.correct++;
  d.xp += xp;
  const t = (d.t[type] ??= [0, 0]);
  t[0]++;
  if (correct) t[1]++;
  S.xp += xp;
  const next = updateStreak(
    { streak: S.streak.count, longest: S.streak.longest, lastDate: S.streak.last },
    localDate(),
  );
  S.streak = { count: next.streak, longest: next.longest, last: next.lastDate };
}

export function recordExercise(ex: Ex, correct: boolean, given: string, expected: string, question: string): void {
  const prev = S.ex[ex.id];
  S.ex[ex.id] = [correct ? 1 : 0, (prev?.[1] ?? 0) + 1];
  if (correct) {
    S.mistakes = S.mistakes.filter((m) => m.exId !== ex.id);
  } else {
    S.mistakes = S.mistakes.filter((m) => m.exId !== ex.id);
    S.mistakes.push({
      id: ex.id,
      exId: ex.id,
      q: question,
      given,
      ans: expected,
      expl: ex.explanation,
      at: new Date().toISOString(),
    });
  }
}

export function addFreeMistake(q: string, given: string, ans: string, expl: string): void {
  const id = `m${Date.now().toString(36)}`;
  S.mistakes.push({ id, exId: null, q, given, ans, expl, at: new Date().toISOString() });
}

export function resolveMistake(id: string): void {
  S.mistakes = S.mistakes.filter((m) => m.id !== id);
}

export function introduceWord(id: string, firstDueMs = 20 * 3_600_000): void {
  if (S.cards[id]) return;
  const c = newCard();
  S.cards[id] = {
    due: new Date(Date.now() + firstDueMs).toISOString(),
    iv: c.intervalDays,
    ef: c.easeFactor,
    reps: c.repetitions,
    lapses: c.lapses,
  };
}

export function rateCard(id: string, rating: Rating): Card {
  const c = S.cards[id] ?? (introduceWord(id, 0), S.cards[id]!);
  const n = schedule({ intervalDays: c.iv, easeFactor: c.ef, repetitions: c.reps, lapses: c.lapses }, rating);
  const card: Card = {
    due: n.dueAt.toISOString(),
    iv: n.intervalDays,
    ef: n.easeFactor,
    reps: n.repetitions,
    lapses: n.lapses,
  };
  S.cards[id] = card;
  return card;
}

/** Promote when the level is complete. Returns the new level or null. */
export function maybePromote(): Level | null {
  const p = S.profile;
  if (!p) return null;
  const up = nextLevel(p.level);
  if (!up || !checkPromotion(levelStats(p.level)).eligible) return null;
  p.level = up;
  return up;
}

export function resetAll(): void {
  const locale = S.profile?.locale ?? 'ar';
  S = emptyState();
  S.profile = null;
  save();
  void locale;
}

export { LEVELS };
