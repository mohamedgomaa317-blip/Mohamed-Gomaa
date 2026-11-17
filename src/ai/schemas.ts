import { z } from 'zod';

/**
 * Output contracts for every AI call. The same zod schema is used twice:
 *  1. converted to JSON Schema and sent as `output_config.format` (constrained decoding);
 *  2. to validate the parsed object at runtime before we touch it.
 * Keep schemas simple (no numeric/length constraints) so they stay within what
 * structured outputs supports; trim lengths in code instead.
 */

export const Correction = z.object({
  original: z.string(),
  better: z.string(),
  explanation: z.string(),
});

export const ChatReplySchema = z.object({
  reply: z.string(),
  corrections: z.array(Correction),
  encouragement: z.string(),
});
export type ChatReply = z.infer<typeof ChatReplySchema>;

export const WritingFeedbackSchema = z.object({
  corrected: z.string(),
  errors: z.array(
    z.object({
      original: z.string(),
      correction: z.string(),
      explanation: z.string(),
      category: z.enum(['grammar', 'vocabulary', 'spelling', 'punctuation', 'style', 'word_order']),
    }),
  ),
  tips: z.array(z.string()),
  cefr: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  summary: z.string(),
});
export type WritingFeedback = z.infer<typeof WritingFeedbackSchema>;

export const ExplanationSchema = z.object({
  topic: z.string(),
  simple_english: z.string(),
  arabic: z.string(),
  examples: z.array(z.string()),
  drill: z.array(z.object({ question: z.string(), answer: z.string() })),
});
export type Explanation = z.infer<typeof ExplanationSchema>;
