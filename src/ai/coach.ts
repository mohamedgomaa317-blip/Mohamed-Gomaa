import type { Level, Locale } from '../types.js';
import type { AiClient, AiResult, ChatTurn } from './client.js';
import {
  ChatReplySchema,
  ExplanationSchema,
  WritingFeedbackSchema,
  type ChatReply,
  type Explanation,
  type WritingFeedback,
} from './schemas.js';

const LEVEL_GUIDE: Record<Level, string> = {
  A1: 'very short sentences, present simple, the 500 most common words',
  A2: 'short sentences, simple past and future, everyday vocabulary',
  B1: 'clear connected sentences, common idioms only if explained, present perfect and conditionals',
  B2: 'natural fluent English, a wide range of structures, some idiomatic language',
  C1: 'sophisticated, nuanced English with idioms, hedging and complex structures',
};

function explainLang(locale: Locale): string {
  return locale === 'ar'
    ? 'Modern Standard Arabic in a clear, friendly tone that Egyptian learners find natural (you may add the English term in brackets)'
    : 'simple English';
}

export function chatSystemPrompt(level: Level, locale: Locale, topic: string | undefined): string {
  return [
    `You are a warm, patient English conversation partner for an Arabic-speaking learner at CEFR ${level}.`,
    `Speak only English in "reply", using ${LEVEL_GUIDE[level]}. Keep "reply" to 1–3 sentences and end with a question that keeps the conversation going.`,
    topic ? `The conversation topic is: ${topic}.` : 'Choose everyday topics the learner can talk about.',
    `In "corrections", list real mistakes from the learner's LAST message only (max 3): "original" = their words, "better" = a natural correction, "explanation" written in ${explainLang(locale)}. If there are no mistakes, return an empty list — never invent mistakes.`,
    `"encouragement" is one short sentence in ${explainLang(locale)}.`,
  ].join('\n');
}

export function writingSystemPrompt(level: Level, locale: Locale): string {
  return [
    `You are an expert English writing coach for Arabic-speaking learners (current level ${level}).`,
    'Return: "corrected" = the full text corrected but keeping the learner\'s voice and meaning;',
    `"errors" = each real error (max 12) with the exact original fragment, the correction, and an explanation in ${explainLang(locale)};`,
    `"tips" = exactly 3 concrete upgrade tips in ${explainLang(locale)}, each with an English example phrase;`,
    '"cefr" = your honest CEFR band estimate for this text; "summary" = one-sentence overall feedback in the same explanation language.',
    'Pay special attention to errors typical of Arabic speakers: missing "be", articles, prepositions, subject–verb agreement, run-on sentences joined with commas.',
  ].join('\n');
}

export function explainSystemPrompt(level: Level, locale: Locale): string {
  return [
    `You explain English grammar points and words to an Arabic-speaking learner at CEFR ${level}.`,
    '"simple_english": a clear explanation in simple English (max 80 words).',
    `"arabic": the same explanation in Arabic (Modern Standard, clear and friendly)${locale === 'en' ? '' : ', mentioning common mistakes Arabic speakers make'}.`,
    '"examples": exactly 3 natural example sentences.',
    '"drill": exactly 3 short practice questions (gap-fill or transformation) with a short exact "answer" each.',
  ].join('\n');
}

export function chatTurn(
  ai: AiClient,
  level: Level,
  locale: Locale,
  history: ChatTurn[],
  topic?: string,
): Promise<AiResult<ChatReply>> {
  return ai.structured({
    system: chatSystemPrompt(level, locale, topic),
    messages: history,
    schema: ChatReplySchema,
    maxTokens: 1_500,
  });
}

export function reviewWriting(
  ai: AiClient,
  level: Level,
  locale: Locale,
  text: string,
  task?: string,
): Promise<AiResult<WritingFeedback>> {
  const content = task ? `Writing task: ${task}\n\nLearner's text:\n${text}` : `Learner's text:\n${text}`;
  return ai.structured({
    system: writingSystemPrompt(level, locale),
    messages: [{ role: 'user', content }],
    schema: WritingFeedbackSchema,
    maxTokens: 4_000,
  });
}

export function explainTopic(
  ai: AiClient,
  level: Level,
  locale: Locale,
  topic: string,
): Promise<AiResult<Explanation>> {
  return ai.structured({
    system: explainSystemPrompt(level, locale),
    messages: [{ role: 'user', content: `Explain: ${topic}` }],
    schema: ExplanationSchema,
    maxTokens: 2_500,
  });
}
