import { describe, expect, it } from 'vitest';
import {
  checkPromotion,
  nextLevel,
  parseLevel,
  placementResult,
  startPlacement,
  stepPlacement,
} from '../src/engine/level.js';

function run(scores: number[]) {
  let s = startPlacement('A2');
  for (const sc of scores) {
    if (s.done) break;
    s = stepPlacement(s, sc);
  }
  return s;
}

describe('levels', () => {
  it('parses and steps levels', () => {
    expect(parseLevel('b1')).toBe('B1');
    expect(() => parseLevel('Z9')).toThrow();
    expect(nextLevel('A1')).toBe('A2');
    expect(nextLevel('C1')).toBeNull();
  });

  it('promotion needs all units passed and 60% of the vocab known', () => {
    expect(checkPromotion({ unitsTotal: 3, unitsPassed: 3, vocabTotal: 18, vocabKnown: 11 }).eligible).toBe(true);
    expect(checkPromotion({ unitsTotal: 3, unitsPassed: 2, vocabTotal: 18, vocabKnown: 18 }).eligible).toBe(false);
    expect(checkPromotion({ unitsTotal: 3, unitsPassed: 3, vocabTotal: 18, vocabKnown: 5 }).eligible).toBe(false);
    expect(checkPromotion({ unitsTotal: 0, unitsPassed: 0, vocabTotal: 0, vocabKnown: 0 }).eligible).toBe(false);
  });
});

describe('adaptive placement', () => {
  it('fails A2 then fails A1 → A1', () => {
    const s = run([0, 0]);
    expect(s.done).toBe(true);
    expect(placementResult(s)).toBe('A1');
  });
  it('fails A2 but passes A1 → A2', () => {
    const s = run([1, 3, 0]);
    expect(placementResult(s)).toBe('A2');
  });
  it('passes A2 and B1, fails B2 → studies B2', () => {
    const s = run([3, 2, 1]);
    expect(s.done).toBe(true);
    expect(placementResult(s)).toBe('B2');
  });
  it('passes everything → C1', () => {
    const s = run([3, 3, 3, 3, 3]);
    expect(s.done).toBe(true);
    expect(placementResult(s)).toBe('C1');
  });
  it('always terminates', () => {
    for (let mask = 0; mask < 64; mask++) {
      const scores = Array.from({ length: 6 }, (_, i) => ((mask >> i) & 1 ? 3 : 0));
      expect(run(scores).done).toBe(true);
    }
  });
});
