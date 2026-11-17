export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type Level = (typeof LEVELS)[number];
export type Locale = 'ar' | 'en';

export type ExerciseType = 'mcq' | 'gap_fill' | 'word_order' | 'translate' | 'dictation' | 'speaking';

export interface GrammarPoint {
  name: string;
  /** Short rule in simple English. */
  rule: string;
  /** Same rule explained in Arabic. */
  ar: string;
  examples: string[];
}

export interface VocabItem {
  id: string;
  word: string;
  ipa: string;
  translation: string;
  example: string;
  tags: string[];
}

export interface DialogueTurn {
  /** What the partner says. */
  bot: string;
  /** What we expect the learner to say: keywords (any order) + one model reply. */
  expect: { keywords: string[]; sample: string };
}

export interface Dialogue {
  title: string;
  setting: string;
  turns: DialogueTurn[];
}

export interface ExerciseSeed {
  id: string;
  type: ExerciseType;
  prompt: string;
  options?: string[];
  /** Accepted answers separated by `|`. */
  answer: string;
  explanation: string;
  points?: number;
}

export interface DictationSeed {
  id: string;
  sentence: string;
  hidden: string[];
}

export interface UnitSeed {
  id: string;
  level: Level;
  order: number;
  title: string;
  theme: string;
  minutes: number;
  grammar: GrammarPoint[];
  vocab: VocabItem[];
  dialogue: Dialogue;
  exercises: ExerciseSeed[];
  dictation: DictationSeed[];
}

/** Row shapes (DB). */
export interface UserRow {
  id: 1;
  name: string;
  level: Level;
  target_level: Level;
  daily_minutes: number;
  created_at: string;
  locale: Locale;
  streak_count: number;
  longest_streak: number;
  xp: number;
  last_session_date: string | null;
}

export interface UnitRow {
  id: string;
  level: Level;
  order_index: number;
  title: string;
  theme: string;
  estimated_minutes: number;
  grammar_points_json: string;
  vocab_json: string;
  dialogue_json: string;
  exercise_ids_json: string;
}

export interface ExerciseRow {
  id: string;
  level: Level;
  unit_id: string;
  type: ExerciseType;
  prompt: string;
  options_json: string | null;
  answer: string;
  explanation: string;
  points: number;
}

export interface VocabRow {
  id: string;
  level: Level;
  word: string;
  ipa: string;
  translation: string;
  example: string;
  tags_json: string;
}

export interface ReviewRow {
  vocab_id: string;
  due_at: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  lapses: number;
  last_rating: number | null;
}

export interface MistakeRow {
  id: number;
  exercise_id: string | null;
  question: string;
  given_answer: string;
  correct_answer: string;
  explanation: string;
  created_at: string;
  resolved_at: string | null;
}

export interface WordsRow {
  id: string;
  level: Level;
  unit_id: string;
  sentence: string;
  hidden_words_json: string;
}
