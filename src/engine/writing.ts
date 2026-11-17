/**
 * Offline writing checker. Deterministic, rule-based, tuned for the most
 * frequent errors of Arabic-speaking learners. It is honest about its limits:
 * it catches patterns, not every error — the AI coach goes deeper.
 */
import type { Level, Locale } from '../types.js';

export interface WritingIssue {
  original: string;
  correction: string;
  explanation: { en: string; ar: string };
  category: 'grammar' | 'vocabulary' | 'spelling' | 'punctuation' | 'style';
}

export interface WritingReport {
  corrected: string;
  issues: WritingIssue[];
  stats: {
    words: number;
    sentences: number;
    avgSentenceLength: number;
    lexicalDiversity: number;
    linkers: string[];
    longWords: number;
  };
  cefr: Level;
  tips: { en: string; ar: string }[];
}

interface Rule {
  re: RegExp;
  fix: (m: RegExpExecArray) => string | null;
  en: string;
  ar: string;
  category: WritingIssue['category'];
}

const UNCOUNTABLE =
  'informations|advices|furnitures|equipments|homeworks|knowledges|luggages|evidences|researches|feedbacks';
const NUMBER_WORD =
  '\\d+|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty';

/** Keep case of the first letter when replacing. */
function keepCase(orig: string, repl: string): string {
  return orig[0] && orig[0] === orig[0].toUpperCase() ? repl[0]!.toUpperCase() + repl.slice(1) : repl;
}

const RULES: Rule[] = [
  {
    re: /\bi\b(?!\.e\.)/g,
    fix: () => 'I',
    en: 'The pronoun "I" is always a capital letter.',
    ar: 'الضمير I يُكتب دائمًا بحرف كبير.',
    category: 'spelling',
  },
  {
    re: /\b(he|she|it)\s+don'?t\b/gi,
    fix: (m) => `${m[1]} doesn't`,
    en: 'With he/she/it use "doesn\'t".',
    ar: "مع he/she/it نستخدم doesn't وليس don't.",
    category: 'grammar',
  },
  {
    re: /\b(didn'?t|did not|doesn'?t|does not|don'?t|do not)\s+(went|saw|ate|took|came|made|had|bought|got|wrote|spoke|told|said|found|gave|knew|thought)\b/gi,
    fix: (m) => `${m[1]} ${BASE[m[2]!.toLowerCase()] ?? m[2]}`,
    en: "After do/does/did, use the base verb (didn't go, not didn't went).",
    ar: "بعد did/does/do يأتي الفعل في صيغته الأصلية: didn't go وليس didn't went.",
    category: 'grammar',
  },
  {
    re: /\b(can|could|must|should|will|would|might|may)\s+to\s+(\w+)/gi,
    fix: (m) => `${m[1]} ${m[2]}`,
    en: 'Modal verbs are followed by the base verb without "to" (can go, not can to go).',
    ar: 'الأفعال الناقصة (can, must, should…) يأتي بعدها الفعل مباشرة بدون to.',
    category: 'grammar',
  },
  {
    re: /(?<!\b(?:did|does|do|can|could|will|would|should|must|might|may|to|let|make|made|help|helped|why|where|when)\s+)\b(he|she|it)\s+(say|go|want|like|need|work|live|have|do|think|know|make|take|come|see|get|play|study|watch|eat|drink)\b/gi,
    fix: (m) => `${m[1]} ${thirdPerson(m[2]!)}`,
    en: 'Present simple with he/she/it adds -s: he says, she goes, it has.',
    ar: 'في المضارع البسيط مع he/she/it نضيف s للفعل: he says / she goes / it has.',
    category: 'grammar',
  },
  {
    re: /\b(dont|doesnt|didnt|cant|wont|isnt|arent|wasnt|werent|havent|hasnt|couldnt|shouldnt|wouldnt|im|ive|youre|theyre)\b/gi,
    fix: (m) => keepCase(m[1]!, APOSTROPHE[m[1]!.toLowerCase()] ?? m[1]!),
    en: "Contractions need an apostrophe: don't, can't, I'm.",
    ar: "الاختصارات تحتاج فاصلة عليا ('): don't و can't و I'm.",
    category: 'spelling',
  },
  {
    re: /\bmore\s+(better|worse|easier|bigger|smaller|faster|cheaper|happier|older|younger)\b/gi,
    fix: (m) => m[1]!,
    en: 'Do not use "more" with a comparative that already ends in -er.',
    ar: 'لا نستخدم more مع صفة مقارنة تنتهي بـ er: better وليس more better.',
    category: 'grammar',
  },
  {
    re: new RegExp(`\\b(${UNCOUNTABLE})\\b`, 'gi'),
    fix: (m) => m[1]!.replace(/s$/i, ''),
    en: 'This noun is uncountable in English — no plural -s (information, advice, homework).',
    ar: 'هذا الاسم غير معدود في الإنجليزية ولا يُجمع بـ s (information, advice, homework).',
    category: 'grammar',
  },
  {
    re: /\b(I|we|they|you)\s+(am|are)\s+agree\b/gi,
    fix: (m) => `${m[1]} agree`,
    en: '"Agree" is a verb: say "I agree", not "I am agree".',
    ar: 'agree فعل وليست صفة: نقول I agree وليس I am agree.',
    category: 'grammar',
  },
  {
    re: /\bdiscuss(es|ed|ing)?\s+about\b/gi,
    fix: (m) => `discuss${m[1] ?? ''}`,
    en: '"Discuss" takes a direct object — no "about".',
    ar: 'الفعل discuss لا يحتاج about: discuss the problem.',
    category: 'vocabulary',
  },
  {
    re: /\bexplain(s|ed)?\s+(me|him|her|us|them)\b/gi,
    fix: (m) => `explain${m[1] ?? ''} to ${m[2]}`,
    en: 'Say "explain to me", not "explain me".',
    ar: 'نقول explain to me وليس explain me.',
    category: 'grammar',
  },
  {
    re: new RegExp(`\\bsince\\s+(${NUMBER_WORD}|a few|several|many)\\s+(years?|months?|weeks?|days?|hours?)\\b`, 'gi'),
    fix: (m) => `for ${m[1]} ${m[2]}`,
    en: 'Use "for" with a period of time ("since" needs a starting point, e.g. since 2020) — and usually the present perfect: I have lived here for 5 years.',
    ar: 'مع المدة نستخدم for، أما since فتأتي مع نقطة بداية (since 2020). ومعها غالبًا المضارع التام: I have lived here for 5 years وليس I live here.',
    category: 'grammar',
  },
  {
    re: /\bpeople\s+is\b/gi,
    fix: () => 'people are',
    en: '"People" is plural: people are.',
    ar: 'كلمة people جمع: people are.',
    category: 'grammar',
  },
  {
    re: /\bmuch\s+(people|friends|cars|books|things|students|times|problems|questions|countries)\b/gi,
    fix: (m) => `many ${m[1]}`,
    en: 'Use "many" with countable plural nouns.',
    ar: 'نستخدم many مع الأسماء المعدودة في الجمع.',
    category: 'grammar',
  },
  {
    re: new RegExp(`\\bI\\s+have\\s+(${NUMBER_WORD})\\s+years?(?!\\s+(of|experience))(\\s+old)?\\b`, 'gi'),
    fix: (m) => `I am ${m[1]} years old`,
    en: 'For age, English uses "be": I am 25 years old.',
    ar: 'للتعبير عن العمر نستخدم be وليس have: I am 25 years old.',
    category: 'grammar',
  },
  {
    re: /\breturn(s|ed|ing)?\s+back\b/gi,
    fix: (m) => `return${m[1] ?? ''}`,
    en: '"Return" already means "go back" — drop "back".',
    ar: 'return تعني «يعود» أصلًا، فلا داعي لـ back.',
    category: 'style',
  },
  {
    re: /\benter(s|ed|ing)?\s+(to|into)\s+the\s+(room|class|house|building|office)\b/gi,
    fix: (m) => `enter${m[1] ?? ''} the ${m[3]}`,
    en: '"Enter" takes a direct object: enter the room.',
    ar: 'الفعل enter لا يحتاج حرف جر: enter the room.',
    category: 'vocabulary',
  },
  {
    re: /\bmarried\s+with\b/gi,
    fix: () => 'married to',
    en: 'Say "married to someone".',
    ar: 'نقول married to وليس married with.',
    category: 'vocabulary',
  },
  {
    re: /\bdepend(s|ed|ing)?\s+of\b/gi,
    fix: (m) => `depend${m[1] ?? ''} on`,
    en: 'Say "depend on".',
    ar: 'نقول depend on وليس depend of.',
    category: 'vocabulary',
  },
  {
    re: /\b(do|did|does|doing)\s+(a|many|some|the)?\s*mistakes?\b/gi,
    fix: (m) => m[0]!.replace(/\b(do|did|does|doing)\b/i, (v) => keepCase(v, MAKE[v.toLowerCase()] ?? 'make')),
    en: 'We "make" mistakes, not "do" them.',
    ar: 'نقول make a mistake وليس do a mistake.',
    category: 'vocabulary',
  },
  {
    re: /\bthe\s+(life|society|nature|happiness|money|education)\s+(is|are|has|can)\b/gi,
    fix: (m) => `${m[1]} ${m[2]}`,
    en: 'For general ideas, English uses no article: "Life is short", not "The life is short".',
    ar: 'في الحديث العام لا نستخدم the: Life is beautiful وليس The life is beautiful (عكس العربية «الحياة»).',
    category: 'grammar',
  },
  {
    re: /\ba\s+((?:a|e|i|o)\w+)\b/gi,
    fix: (m) => (/^(one|once|eu|use|usual|uni)/i.test(m[1]!) ? null : `an ${m[1]}`),
    en: 'Use "an" before a vowel sound (an apple, an idea).',
    ar: 'نستخدم an قبل الكلمة التي تبدأ بصوت متحرك: an apple.',
    category: 'grammar',
  },
  {
    re: /\b(\w+)\s+\1\b/gi,
    fix: (m) => (/^(that|had|very)$/i.test(m[1]!) ? null : m[1]!),
    en: 'Repeated word.',
    ar: 'كلمة مكررة.',
    category: 'spelling',
  },
  {
    re: /\s+([,.!?;:])/g,
    fix: (m) => m[1]!,
    en: 'No space before punctuation.',
    ar: 'لا نضع مسافة قبل علامات الترقيم.',
    category: 'punctuation',
  },
];

const BASE: Record<string, string> = {
  went: 'go',
  saw: 'see',
  ate: 'eat',
  took: 'take',
  came: 'come',
  made: 'make',
  had: 'have',
  bought: 'buy',
  got: 'get',
  wrote: 'write',
  spoke: 'speak',
  told: 'tell',
  said: 'say',
  found: 'find',
  gave: 'give',
  knew: 'know',
  thought: 'think',
};
const APOSTROPHE: Record<string, string> = {
  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  cant: "can't",
  wont: "won't",
  isnt: "isn't",
  arent: "aren't",
  wasnt: "wasn't",
  werent: "weren't",
  havent: "haven't",
  hasnt: "hasn't",
  couldnt: "couldn't",
  shouldnt: "shouldn't",
  wouldnt: "wouldn't",
  im: "I'm",
  ive: "I've",
  youre: "you're",
  theyre: "they're",
};

export function thirdPerson(verb: string): string {
  const v = verb.toLowerCase();
  if (v === 'have') return 'has';
  if (v === 'do' || v === 'go') return `${v}es`;
  if (/(s|sh|ch|x|z)$/.test(v)) return `${v}es`;
  if (/[^aeiou]y$/.test(v)) return `${v.slice(0, -1)}ies`;
  return `${v}s`;
}

const MAKE: Record<string, string> = { do: 'make', did: 'made', does: 'makes', doing: 'making' };

export const LINKERS = [
  'however',
  'although',
  'therefore',
  'moreover',
  'furthermore',
  'whereas',
  'despite',
  'in addition',
  'on the other hand',
  'because',
  'so',
  'but',
  'also',
  'firstly',
  'finally',
  'for example',
  'for instance',
  'as a result',
  'nevertheless',
  'while',
  'unless',
  'in conclusion',
  'consequently',
  'even though',
];
const ADVANCED_LINKERS = new Set([
  'moreover',
  'furthermore',
  'whereas',
  'nevertheless',
  'consequently',
  'even though',
  'despite',
  'as a result',
]);

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /\p{L}/u.test(s));
}

export function checkWriting(text: string): WritingReport {
  const issues: WritingIssue[] = [];
  let corrected = text;

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = rule.re.exec(text)) !== null) {
      const fix = rule.fix(m);
      if (fix === null || fix === m[0]) continue;
      const key = m[0].toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        issues.push({
          original: m[0].trim(),
          correction: fix.trim(),
          explanation: { en: rule.en, ar: rule.ar },
          category: rule.category,
        });
      }
    }
    const replacer = new RegExp(rule.re.source, rule.re.flags);
    corrected = corrected.replace(replacer, (...args) => {
      const groups = args.slice(0, -2) as string[];
      const exec = Object.assign([...groups], { index: 0, input: '' }) as unknown as RegExpExecArray;
      const fix = rule.fix(exec);
      return fix ?? groups[0]!;
    });
  }

  // Sentence-level checks.
  const sentences = splitSentences(text);
  for (const s of sentences) {
    const first = s.match(/\p{L}/u)?.[0];
    // A lone lowercase "i" is already reported by the pronoun rule.
    if (first && first !== first.toUpperCase() && !/^\W*i\b/.test(s)) {
      issues.push({
        original: s.slice(0, 25),
        correction: s.slice(0, 25).replace(first, first.toUpperCase()),
        explanation: { en: 'Start every sentence with a capital letter.', ar: 'ابدأ كل جملة بحرف كبير.' },
        category: 'punctuation',
      });
    }
    const words = s.split(/\s+/).length;
    const commas = (s.match(/,/g) ?? []).length;
    if (words > 35 || (commas >= 3 && !/\b(and|but|which|who|because)\b/i.test(s))) {
      issues.push({
        original: s.length > 60 ? `${s.slice(0, 57)}…` : s,
        correction: '(split into 2–3 shorter sentences)',
        explanation: {
          en: 'This sentence is very long. English prefers shorter sentences joined by clear linkers, not a chain of commas.',
          ar: 'الجملة طويلة جدًا. الإنجليزية تفضّل جملًا أقصر مع أدوات ربط واضحة بدل سلسلة من الفواصل (عادة منقولة من العربية).',
        },
        category: 'style',
      });
    }
  }
  corrected = corrected.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_, p: string, c: string) => p + c.toUpperCase());

  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const unique = new Set(words);
  const lower = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const linkers = LINKERS.filter((l) => new RegExp(`\\b${l}\\b`).test(lower));
  const longWords = words.filter((w) => w.length >= 8).length;
  const avg = sentences.length ? words.length / sentences.length : words.length;
  const diversity = words.length ? unique.size / words.length : 0;

  const stats = {
    words: words.length,
    sentences: sentences.length,
    avgSentenceLength: Math.round(avg * 10) / 10,
    lexicalDiversity: Math.round(diversity * 100) / 100,
    linkers,
    longWords,
  };

  return { corrected, issues, stats, cefr: estimateCefr(stats, issues.length), tips: buildTips(stats) };
}

/** Rough heuristic, clearly labelled as an estimate in the UI. */
export function estimateCefr(stats: WritingReport['stats'], issueCount: number): Level {
  if (stats.words < 15) return 'A1';
  let score = 0;
  score += Math.min(3, stats.avgSentenceLength / 6); // 18+ words/sentence → 3
  score += Math.min(2, (stats.longWords / Math.max(1, stats.words)) * 20); // 10% long words → 2
  score += Math.min(2, stats.linkers.length * 0.5);
  score += stats.linkers.some((l) => ADVANCED_LINKERS.has(l)) ? 1 : 0;
  score += stats.lexicalDiversity > 0.7 ? 1 : stats.lexicalDiversity > 0.55 ? 0.5 : 0;
  score -= Math.min(3, (issueCount / Math.max(1, stats.words)) * 40);
  if (score >= 7) return 'C1';
  if (score >= 5.5) return 'B2';
  if (score >= 4) return 'B1';
  if (score >= 2.5) return 'A2';
  return 'A1';
}

function buildTips(stats: WritingReport['stats']): { en: string; ar: string }[] {
  const tips: { en: string; ar: string }[] = [];
  if (stats.linkers.length < 2) {
    tips.push({
      en: 'Connect your ideas with linkers: "However, …", "As a result, …", "Although …".',
      ar: 'اربط أفكارك بأدوات ربط مثل However و As a result و Although.',
    });
  } else if (!stats.linkers.some((l) => ADVANCED_LINKERS.has(l))) {
    tips.push({
      en: 'Upgrade your linkers: try "Moreover", "Whereas" or "As a result".',
      ar: 'طوّر أدوات الربط: جرّب Moreover أو Whereas أو As a result.',
    });
  }
  if (stats.avgSentenceLength < 8) {
    tips.push({
      en: 'Combine short sentences: "I was tired. I went to bed." → "I was so tired that I went to bed early."',
      ar: 'ادمج الجمل القصيرة في جملة واحدة مركّبة باستخدام so…that أو because أو which.',
    });
  } else if (stats.avgSentenceLength > 25) {
    tips.push({
      en: 'Some sentences are long — aim for 12–20 words per sentence for clarity.',
      ar: 'بعض الجمل طويلة — استهدف ١٢–٢٠ كلمة في الجملة للوضوح.',
    });
  }
  if (stats.lexicalDiversity < 0.55) {
    tips.push({
      en: 'You repeat some words. Use synonyms: good → useful / helpful / excellent.',
      ar: 'تكرر بعض الكلمات. استخدم مرادفات: good ← useful / helpful / excellent.',
    });
  }
  tips.push({
    en: 'Add one specific example or number to support your main point.',
    ar: 'أضف مثالًا محددًا أو رقمًا يدعم فكرتك الرئيسية.',
  });
  tips.push({
    en: 'Read your text aloud — if you need to breathe in the middle of a sentence, split it.',
    ar: 'اقرأ النص بصوت عالٍ — إن احتجت أن تتنفس في منتصف الجملة فقسّمها.',
  });
  return tips.slice(0, 3);
}

export function pick(locale: Locale, text: { en: string; ar: string }): string {
  return locale === 'ar' ? text.ar : text.en;
}
