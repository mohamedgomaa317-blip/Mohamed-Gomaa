/**
 * Answer grading. Pure functions only — no I/O.
 *
 * Design goals:
 *  - Forgive formatting noise (case, punctuation, extra spaces, curly quotes).
 *  - Treat contractions as equal to their full forms ("don't" == "do not").
 *  - Distinguish a real error from a typo: a small edit distance is "almost" —
 *    accepted for XP but flagged, so the learner sees the correct spelling.
 */

const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am',
  "you're": 'you are',
  "we're": 'we are',
  "they're": 'they are',
  "he's": 'he is',
  "she's": 'she is',
  "it's": 'it is',
  "that's": 'that is',
  "there's": 'there is',
  "what's": 'what is',
  "i've": 'i have',
  "you've": 'you have',
  "we've": 'we have',
  "they've": 'they have',
  "i'll": 'i will',
  "you'll": 'you will',
  "he'll": 'he will',
  "she'll": 'she will',
  "we'll": 'we will',
  "they'll": 'they will',
  "it'll": 'it will',
  "i'd": 'i would',
  "you'd": 'you would',
  "he'd": 'he would',
  "she'd": 'she would',
  "we'd": 'we would',
  "they'd": 'they would',
  "don't": 'do not',
  "doesn't": 'does not',
  "didn't": 'did not',
  "isn't": 'is not',
  "aren't": 'are not',
  "wasn't": 'was not',
  "weren't": 'were not',
  "haven't": 'have not',
  "hasn't": 'has not',
  "hadn't": 'had not',
  "won't": 'will not',
  "wouldn't": 'would not',
  "can't": 'cannot',
  "couldn't": 'could not',
  "shouldn't": 'should not',
  "mustn't": 'must not',
  "let's": 'let us',
};

export function normalize(text: string): string {
  let s = text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\bcan not\b/g, 'cannot');
  s = s
    .split(/\s+/)
    .map((w) => {
      const bare = w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
      return CONTRACTIONS[bare] ?? bare;
    })
    .join(' ');
  return s
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Edit distance with adjacent transpositions (optimal string alignment),
 * so the classic typo "studnet" → "student" costs 1, not 2.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** 1.0 = identical, 0.0 = nothing in common (character level, after normalisation). */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  const longest = Math.max(na.length, nb.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(na, nb) / longest;
}

export interface GradeResult {
  correct: boolean;
  /** Accepted, but with a small typo. */
  almost: boolean;
  /** The accepted answer closest to what the learner typed. */
  expected: string;
  score: number;
}

export function splitAnswers(answer: string): string[] {
  return answer
    .split('|')
    .map((a) => a.trim())
    .filter(Boolean);
}

/**
 * Grade free text against `|`-separated accepted answers.
 * `typoTolerance` is the max share of characters that may differ for an "almost".
 */
export function gradeText(given: string, answer: string, typoTolerance = 0.15): GradeResult {
  const accepted = splitAnswers(answer);
  const g = normalize(given);
  let best: GradeResult = { correct: false, almost: false, expected: accepted[0] ?? answer, score: 0 };
  if (!g) return best;
  for (const a of accepted) {
    const n = normalize(a);
    if (n === g) return { correct: true, almost: false, expected: a, score: 1 };
    const dist = levenshtein(n, g);
    const score = 1 - dist / Math.max(n.length, g.length);
    // A 1–2 letter word with one wrong letter is a different word, not a typo.
    const allowed = Math.max(n.length <= 3 ? 0 : 1, Math.floor(n.length * typoTolerance));
    if (score > best.score) {
      best = { correct: false, almost: dist <= allowed, expected: a, score };
    }
  }
  if (best.almost) best.correct = true;
  return best;
}

export function gradeMcq(givenIndexOrText: number | string, options: string[], answer: string): GradeResult {
  const given = typeof givenIndexOrText === 'number' ? (options[givenIndexOrText] ?? '') : givenIndexOrText;
  const ok = normalize(given) === normalize(answer);
  return { correct: ok, almost: false, expected: answer, score: ok ? 1 : 0 };
}

/** Word order is strict about order but forgiving about case/punctuation. No typo tolerance. */
export function gradeWordOrder(given: string, answer: string): GradeResult {
  return gradeText(given, answer, 0);
}

export interface WordDiff {
  word: string;
  status: 'ok' | 'typo' | 'missing' | 'extra';
  given?: string;
}

export interface DictationResult {
  accuracy: number;
  diff: WordDiff[];
  correct: boolean;
}

/**
 * Word-level alignment (LCS-style DP with typo matching) between the target
 * sentence and what the learner typed. Accuracy = matched target words / total.
 */
export function gradeDictation(given: string, target: string, passMark = 0.85): DictationResult {
  const t = normalize(target).split(' ').filter(Boolean);
  const g = normalize(given).split(' ').filter(Boolean);
  const match = (a: string, b: string): 'ok' | 'typo' | null => {
    if (a === b) return 'ok';
    if (a.length > 3 && levenshtein(a, b) <= 1) return 'typo';
    return null;
  };
  const n = t.length;
  const m = g.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const mm = match(t[i]!, g[j]!);
      const take = mm ? (mm === 'ok' ? 1 : 0.75) + dp[i + 1]![j + 1]! : -1;
      dp[i]![j] = Math.max(take, dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const diff: WordDiff[] = [];
  let i = 0;
  let j = 0;
  let score = 0;
  while (i < n && j < m) {
    const mm = match(t[i]!, g[j]!);
    if (mm && dp[i]![j] === (mm === 'ok' ? 1 : 0.75) + dp[i + 1]![j + 1]!) {
      diff.push(mm === 'ok' ? { word: t[i]!, status: 'ok' } : { word: t[i]!, status: 'typo', given: g[j]! });
      score += mm === 'ok' ? 1 : 0.75;
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      diff.push({ word: t[i]!, status: 'missing' });
      i++;
    } else {
      diff.push({ word: g[j]!, status: 'extra' });
      j++;
    }
  }
  while (i < n) diff.push({ word: t[i++]!, status: 'missing' });
  while (j < m) diff.push({ word: g[j++]!, status: 'extra' });
  const extras = diff.filter((d) => d.status === 'extra').length;
  const accuracy = n === 0 ? 1 : Math.max(0, (score - extras * 0.5) / n);
  const rounded = Math.round(accuracy * 100) / 100;
  return { accuracy: rounded, diff, correct: rounded >= passMark };
}

/**
 * Speaking/free reply: share of required keyword groups present.
 * A group may list alternatives separated by `|` ("go|went|gone"); any one counts.
 * Single words also match simple inflections (help → helped, helps).
 */
export function keywordCoverage(given: string, keywords: string[]): number {
  if (keywords.length === 0) return 1;
  const words = normalize(given).split(' ');
  const text = ` ${words.join(' ')} `;
  const matches = (alt: string): boolean => {
    const k = normalize(alt);
    if (!k) return false;
    if (k.includes(' ')) return text.includes(` ${k} `);
    return words.some((w) => w === k || (k.length >= 4 && w.startsWith(k) && w.length - k.length <= 3));
  };
  let hit = 0;
  for (const group of keywords) {
    if (group.split('|').some(matches)) hit++;
  }
  return hit / keywords.length;
}

/** Hide words of a sentence for cloze-dictation display. */
export function maskSentence(sentence: string, hidden: string[], mask = '____'): string {
  let out = sentence;
  for (const h of hidden) {
    const re = new RegExp(`\\b${escapeRegExp(h)}\\b`, 'i');
    out = out.replace(re, mask);
  }
  return out;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Deterministic Fisher–Yates with an optional seeded RNG (tests pass one in). */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
