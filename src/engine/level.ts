import { LEVELS, type Level } from '../types.js';

export function levelIndex(level: Level): number {
  return LEVELS.indexOf(level);
}

export function nextLevel(level: Level): Level | null {
  return LEVELS[levelIndex(level) + 1] ?? null;
}

export function isLevel(value: string): value is Level {
  return (LEVELS as readonly string[]).includes(value.toUpperCase());
}

export function parseLevel(value: string): Level {
  const up = value.trim().toUpperCase();
  if (!isLevel(up)) throw new Error(`Invalid level "${value}". Use one of ${LEVELS.join(', ')}.`);
  return up as Level;
}

/** A unit counts as complete once the best accuracy across its exercises reaches this mark. */
export const UNIT_PASS_MARK = 0.8;
export const VOCAB_MASTERY_FOR_PROMOTION = 0.6;

export interface LevelStats {
  unitsTotal: number;
  unitsPassed: number;
  vocabTotal: number;
  /** Vocab items with at least 2 successful reviews (the "known" threshold for promotion). */
  vocabKnown: number;
}

export interface PromotionCheck {
  eligible: boolean;
  unitProgress: number;
  vocabProgress: number;
}

export function checkPromotion(stats: LevelStats): PromotionCheck {
  const unitProgress = stats.unitsTotal === 0 ? 0 : stats.unitsPassed / stats.unitsTotal;
  const vocabProgress = stats.vocabTotal === 0 ? 1 : stats.vocabKnown / stats.vocabTotal;
  return {
    eligible: stats.unitsTotal > 0 && unitProgress >= 1 && vocabProgress >= VOCAB_MASTERY_FOR_PROMOTION,
    unitProgress,
    vocabProgress,
  };
}

/**
 * Adaptive placement.
 * Starts at A2. Each level gets a block of questions; ≥ 2/3 correct moves up,
 * otherwise placement stops and the learner is placed at the last level passed
 * (or the level where they failed, if it was the first).
 */
export const PLACEMENT_BLOCK = 3;
export const PLACEMENT_PASS = 2;

export interface PlacementState {
  current: Level;
  highestPassed: Level | null;
  done: boolean;
  /** Levels already tested — guards against loops. */
  tested: Level[];
}

export function startPlacement(start: Level = 'A2'): PlacementState {
  return { current: start, highestPassed: null, done: false, tested: [] };
}

export function stepPlacement(state: PlacementState, correctInBlock: number): PlacementState {
  const tested = [...state.tested, state.current];
  const passed = correctInBlock >= PLACEMENT_PASS;
  if (passed) {
    const up = nextLevel(state.current);
    if (!up || tested.includes(up)) {
      return { current: state.current, highestPassed: state.current, done: true, tested };
    }
    return { current: up, highestPassed: state.current, done: false, tested };
  }
  // Failed the first block above A1 → drop down once to confirm the floor.
  if (state.highestPassed === null) {
    const idx = levelIndex(state.current);
    const down = idx > 0 ? LEVELS[idx - 1]! : null;
    if (down && !tested.includes(down)) {
      return { current: down, highestPassed: null, done: false, tested };
    }
    return { current: state.current, highestPassed: null, done: true, tested };
  }
  return { ...state, tested, done: true };
}

/** Final level after placement: one above the highest passed (you study what you don't know yet). */
export function placementResult(state: PlacementState): Level {
  if (state.highestPassed === null) return 'A1';
  const up = nextLevel(state.highestPassed);
  // Passing every block including C1 → C1 (top of the curriculum).
  return up ?? state.highestPassed;
}
