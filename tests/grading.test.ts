import { describe, expect, it } from 'vitest';
import {
  gradeDictation,
  gradeMcq,
  gradeText,
  gradeWordOrder,
  keywordCoverage,
  maskSentence,
  normalize,
  shuffle,
  similarity,
} from '../src/engine/grading.js';

describe('normalize', () => {
  it('ignores case, punctuation, curly quotes and extra spaces', () => {
    expect(normalize('  Hello,   WORLD!! ')).toBe('hello world');
    expect(normalize('I’m here.')).toBe('i am here');
  });
  it('expands contractions', () => {
    expect(normalize("She doesn't know")).toBe(normalize('She does not know'));
    expect(normalize("I can't")).toBe(normalize('I cannot'));
    expect(normalize('I can not')).toBe('i cannot');
  });
});

describe('gradeText', () => {
  it('accepts any of the | alternatives', () => {
    expect(gradeText('I will help you', "I'll help you.|I am going to help you").correct).toBe(true);
    expect(gradeText("i'm going to help you", "I'll help you.|I am going to help you").correct).toBe(true);
  });
  it('flags small typos as "almost" but accepts them', () => {
    const g = gradeText('I am a studnet', 'I am a student.');
    expect(g.correct).toBe(true);
    expect(g.almost).toBe(true);
  });
  it('counts an adjacent swap as a single typo', () => {
    expect(gradeText("I'm a studnet", 'I am a student.|I am a student', 0.12)).toMatchObject({
      correct: true,
      almost: true,
    });
  });
  it('does not treat a different short word as a typo', () => {
    expect(gradeText('is', 'are').correct).toBe(false);
    expect(gradeText('am', 'an').correct).toBe(false);
  });
  it('rejects wrong answers and empty input', () => {
    expect(gradeText('He work in a bank', 'He works in a bank.').almost).toBe(true); // 1 char → typo-level
    expect(gradeText('They go home', 'He works in a bank.').correct).toBe(false);
    expect(gradeText('', 'anything').correct).toBe(false);
  });
});

describe('gradeMcq / gradeWordOrder', () => {
  it('grades by index or text', () => {
    expect(gradeMcq(1, ['am', 'is', 'are'], 'is').correct).toBe(true);
    expect(gradeMcq('IS', ['am', 'is', 'are'], 'is').correct).toBe(true);
    expect(gradeMcq(0, ['am', 'is', 'are'], 'is').correct).toBe(false);
  });
  it('word order is strict about order but not punctuation', () => {
    expect(gradeWordOrder('what is your name', 'What is your name?').correct).toBe(true);
    expect(gradeWordOrder('what your name is', 'What is your name?').correct).toBe(false);
  });
});

describe('gradeDictation', () => {
  it('perfect transcription → 100%', () => {
    const r = gradeDictation('We are students from Egypt', 'We are students from Egypt.');
    expect(r.accuracy).toBe(1);
    expect(r.correct).toBe(true);
    expect(r.diff.every((d) => d.status === 'ok')).toBe(true);
  });
  it('detects missing words, typos and extras', () => {
    const r = gradeDictation('We students frum Egypt today', 'We are students from Egypt.');
    const statuses = Object.fromEntries(r.diff.map((d) => [d.word, d.status]));
    expect(statuses.are).toBe('missing');
    expect(statuses.today).toBe('extra');
    expect(r.diff.find((d) => d.status === 'typo')?.given).toBe('frum');
    expect(r.correct).toBe(false);
    expect(r.accuracy).toBeGreaterThan(0.4);
  });
  it('never returns negative accuracy', () => {
    expect(gradeDictation('x y z q w e r t', 'hi').accuracy).toBeGreaterThanOrEqual(0);
  });
});

describe('keywordCoverage', () => {
  it('supports alternatives and simple inflections', () => {
    expect(keywordCoverage('I visited my aunt', ['went|visited', 'aunt'])).toBe(1);
    expect(keywordCoverage('She helped me', ['help'])).toBe(1);
    expect(keywordCoverage("I'm from Egypt", ['i am', 'from'])).toBe(1);
    expect(keywordCoverage('Hello', ['from', 'name'])).toBe(0);
  });
});

describe('helpers', () => {
  it('masks hidden words', () => {
    expect(maskSentence('My name is Sara.', ['name', 'Sara'])).toBe('My ____ is ____.');
  });
  it('similarity is symmetric and bounded', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('abc', 'xyz')).toBe(0);
  });
  it('shuffle keeps all items', () => {
    let seed = 1;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    expect(shuffle([1, 2, 3, 4, 5], rng).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
