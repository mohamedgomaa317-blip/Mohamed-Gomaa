import { describe, expect, it } from 'vitest';
import { checkWriting, estimateCefr } from '../src/engine/writing.js';

const corrections = (text: string) => checkWriting(text).issues.map((i) => `${i.original} → ${i.correction}`);

describe('offline writing checker', () => {
  it('catches typical Arabic-speaker errors', () => {
    const r = checkWriting(
      "i am agree with you. He don't like the coffee. I have 25 years. We discussed about the informations since 3 years.",
    );
    const fixed = r.corrected;
    expect(fixed).toContain('I agree');
    expect(fixed).toContain("He doesn't like");
    expect(fixed).toContain('I am 25 years old');
    expect(fixed).toContain('discussed the information');
    expect(fixed).toContain('for 3 years');
    expect(r.issues.length).toBeGreaterThanOrEqual(5);
  });

  it("fixes modal + to, more + comparative, didn't + past", () => {
    const c = corrections("You must to go. It is more better. I didn't went home.");
    expect(c).toContain('must to go → must go');
    expect(c).toContain('more better → better');
    expect(c).toContain("didn't went → didn't go");
  });

  it('adds third-person -s, but not after auxiliaries or modals', () => {
    expect(checkWriting('My father is busy, he work every day and she study at night.').corrected).toContain(
      'he works every day and she studies',
    );
    expect(checkWriting('Does he work here? He can go now. Where does she live?').issues).toHaveLength(0);
  });

  it('restores apostrophes in contractions', () => {
    expect(checkWriting('I dont know and im tired.').corrected).toBe("I don't know and I'm tired.");
  });

  it('handles articles: "a apple" → "an apple" but leaves "a university"', () => {
    const r = checkWriting('I ate a apple at a university.');
    expect(r.corrected).toContain('an apple');
    expect(r.corrected).toContain('a university');
  });

  it('capitalises sentence starts and flags very long comma-chained sentences', () => {
    const r = checkWriting('hello there. this is a test, it has commas, many commas, too many commas, really.');
    expect(r.corrected.startsWith('Hello there. This')).toBe(true);
    expect(r.issues.some((i) => i.category === 'style')).toBe(true);
  });

  it('leaves clean text alone', () => {
    const r = checkWriting('I visited my grandmother last Friday. We had lunch together and talked for hours.');
    expect(r.issues).toHaveLength(0);
    expect(r.corrected).toBe('I visited my grandmother last Friday. We had lunch together and talked for hours.');
  });

  it('always returns 3 tips and plausible stats', () => {
    const r = checkWriting('I like football. I play every day. It is fun.');
    expect(r.tips).toHaveLength(3);
    expect(r.stats.sentences).toBe(3);
    expect(r.stats.words).toBe(10);
  });

  it('CEFR estimate rises with complexity', () => {
    const simple = checkWriting('I like cats. Cats are nice. I have a cat. My cat is black. It sleeps a lot.');
    const complex = checkWriting(
      'Although remote work offers considerable flexibility, it can gradually undermine collaboration. Moreover, ' +
        'employees frequently report feeling isolated, whereas office environments encourage spontaneous conversations. ' +
        'Consequently, organisations should consider hybrid arrangements that balance autonomy with meaningful interaction.',
    );
    const order = ['A1', 'A2', 'B1', 'B2', 'C1'];
    expect(order.indexOf(complex.cefr)).toBeGreaterThan(order.indexOf(simple.cefr));
    expect(
      estimateCefr({ words: 5, sentences: 1, avgSentenceLength: 5, lexicalDiversity: 1, linkers: [], longWords: 0 }, 0),
    ).toBe('A1');
  });
});
