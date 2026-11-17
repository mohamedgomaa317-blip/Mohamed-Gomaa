import type { Ctx } from './context.js';
import type { Session } from './session.js';
import type { ExerciseRow, VocabRow, ReviewRow, WordsRow } from '../types.js';
import {
  gradeDictation,
  gradeMcq,
  gradeText,
  gradeWordOrder,
  keywordCoverage,
  maskSentence,
  shuffle,
  type DictationResult,
  type GradeResult,
} from '../engine/grading.js';
import { ratingFromGrade, RELEARN_MINUTES, type Rating } from '../engine/srs.js';
import { displayStreak, localDate, xpFor } from '../engine/streak.js';
import { ask, choose, pause } from '../ui/ask.js';
import { bad, blank, c, dim, ok, print, warn } from '../ui/out.js';
import { t, type MessageKey } from '../i18n/index.js';
import { speak, ttsAvailable } from '../tts.js';

export interface ExerciseOutcome {
  correct: boolean;
  almost: boolean;
  given: string;
}

function streakNow(ctx: Ctx): number {
  const u = ctx.store.getUser();
  return u
    ? displayStreak({ streak: u.streak_count, longest: u.longest_streak, lastDate: u.last_session_date }, localDate())
    : 0;
}

/** Content words (≥ 5 letters) to hide when no TTS is available. */
export function autoHidden(sentence: string, max = 3): string[] {
  const words = sentence.match(/[A-Za-z']+/g) ?? [];
  return [...new Set(words.filter((w) => w.replace(/'/g, '').length >= 5))]
    .sort((a, b) => b.length - a.length)
    .slice(0, max);
}

export function printDictationDiff(r: DictationResult): void {
  const parts = r.diff.map((d) => {
    if (d.status === 'ok') return c.green(d.word);
    if (d.status === 'typo') return c.yellow(`${d.given}→${d.word}`);
    if (d.status === 'missing') return c.red.underline(`[${d.word}]`);
    return c.red.strikethrough(d.word);
  });
  print(parts.join(' '));
}

/** Ask a dictation sentence (TTS or masked fallback). */
export async function askDictation(
  sentence: string,
  hidden: string[],
): Promise<{ given: string; result: DictationResult }> {
  let given: string;
  if (ttsAvailable()) {
    print(dim(t('ex.dictationListen')));
    speak(sentence, true);
    for (let tries = 0; ; tries++) {
      given = await ask(t('ex.yourAnswer'));
      if (given === ':r' && tries < 4) {
        speak(sentence, true);
        continue;
      }
      break;
    }
  } else {
    print(dim(t('ex.dictationNoTts')));
    print(c.bold(maskSentence(sentence, hidden.length ? hidden : autoHidden(sentence))));
    given = await ask(t('ex.yourAnswer'));
  }
  const result = gradeDictation(given, sentence);
  return { given, result };
}

/**
 * Present one exercise, grade it, give feedback, and persist the attempt.
 * Wrong answers go to the error notebook; a later correct answer resolves them.
 */
export async function runExercise(ctx: Ctx, ex: ExerciseRow, session: Session | null): Promise<ExerciseOutcome> {
  const started = Date.now();
  const options = ex.options_json ? (JSON.parse(ex.options_json) as string[]) : [];
  blank();
  print(c.bold.cyan(`◆ ${t(`ex.${ex.type}` as MessageKey)}`) + dim(`  [${ex.level}]`));

  let grade: GradeResult;
  let given = '';

  switch (ex.type) {
    case 'mcq': {
      print(c.bold(ex.prompt));
      const shuffled = shuffle(options);
      given = await choose(
        t('ex.yourAnswer'),
        shuffled.map((o) => ({ name: o, value: o })),
      );
      grade = gradeMcq(given, options, ex.answer);
      break;
    }
    case 'gap_fill':
      print(c.bold(ex.prompt));
      given = await ask(t('ex.yourAnswer'));
      grade = gradeText(given, ex.answer);
      break;
    case 'word_order':
      print(c.bold(shuffle(options).join('  /  ')));
      given = await ask(t('ex.yourAnswer'));
      grade = gradeWordOrder(given, ex.answer);
      break;
    case 'translate':
      print(c.bold(ex.prompt));
      given = await ask(t('ex.yourAnswer'));
      grade = gradeText(given, ex.answer, 0.12);
      break;
    case 'dictation': {
      const d = await askDictation(ex.answer, []);
      given = d.given;
      printDictationDiff(d.result);
      print(dim(t('ex.dictationScore', { pct: `${Math.round(d.result.accuracy * 100)}%` })));
      grade = { correct: d.result.correct, almost: false, expected: ex.answer, score: d.result.accuracy };
      break;
    }
    case 'speaking': {
      print(c.bold(ex.prompt));
      print(dim(t('ex.speakingHow')));
      given = await ask(t('ex.yourAnswer'));
      const cov = keywordCoverage(given, options);
      const words = given.split(/\s+/).filter(Boolean).length;
      print(dim(t('ex.coverage', { pct: `${Math.round(cov * 100)}%` })));
      grade = { correct: cov >= 0.5 && words >= 4, almost: false, expected: ex.answer, score: cov };
      if (grade.correct) ok(t('ex.correct'));
      print(c.bold(t('ex.speakingModel')), c.green(ex.answer));
      speak(ex.answer);
      print(dim(t('ex.shadow')));
      await pause();
      break;
    }
  }

  const timeMs = Date.now() - started;
  if (ex.type !== 'speaking' && ex.type !== 'dictation') {
    if (grade.correct && !grade.almost) ok(t('ex.correct'));
    else if (grade.almost) warn(t('ex.almost', { expected: grade.expected }));
    else bad(t('ex.wrong', { expected: grade.expected }));
  } else if (grade.correct && ex.type === 'dictation') {
    ok(t('ex.correct'));
  } else if (ex.type === 'dictation') {
    bad(t('ex.wrong', { expected: ex.answer }));
  }
  if (!grade.correct || grade.almost) print(dim(t('ex.why', { explanation: ex.explanation })));

  ctx.store.recordAttempt({
    exercise_id: ex.id,
    unit_id: ex.unit_id,
    level: ex.level,
    correct: grade.correct,
    answer_given: given,
    time_ms: timeMs,
  });
  if (grade.correct) {
    ctx.store.resolveMistakesForExercise(ex.id);
  } else {
    ctx.store.addMistake({
      exercise_id: ex.id,
      question: ex.type === 'word_order' ? options.join(' / ') : ex.prompt,
      given_answer: given,
      correct_answer: grade.expected,
      explanation: ex.explanation,
    });
  }
  session?.record(grade.correct, xpFor(ex.points, grade.correct, grade.almost, streakNow(ctx)));
  return { correct: grade.correct, almost: grade.almost, given };
}

/**
 * One SRS card. New-ish cards (0 reps) use recognition + self-rating;
 * known cards switch to production (type the English word) and are auto-rated.
 */
export async function runReviewCard(ctx: Ctx, card: ReviewRow & VocabRow, session: Session | null): Promise<Rating> {
  const started = Date.now();
  blank();
  let rating: Rating;
  if (card.repetitions === 0) {
    print(c.bold.cyan(card.word) + '  ' + dim(card.ipa));
    speak(card.word);
    await pause(t('review.recall'));
    print(`${c.green(card.translation)}  ${dim('— ' + card.example)}`);
    rating = await choose<Rating>(t('review.rate'), [
      { name: t('review.again'), value: 0 },
      { name: t('review.hard'), value: 1 },
      { name: t('review.good'), value: 2 },
      { name: t('review.easy'), value: 3 },
    ]);
  } else {
    print(t('review.produce'), c.bold.cyan(card.translation));
    const masked = maskSentence(card.example, [card.word], '_'.repeat(Math.max(3, card.word.length)));
    if (masked !== card.example) print(dim(masked));
    const given = await ask(t('ex.yourAnswer'));
    const g = gradeText(given, card.word);
    rating = ratingFromGrade(g.correct && !g.almost, g.almost, Date.now() - started);
    if (rating === 0) bad(t('ex.wrong', { expected: `${card.word} ${card.ipa}` }));
    else if (g.almost) warn(t('ex.almost', { expected: card.word }));
    else ok(t('ex.correct'));
    speak(card.word);
  }
  const next = ctx.store.rateReview(card.vocab_id, rating);
  const when =
    next.interval_days === 0
      ? t('review.inMinutes', { n: RELEARN_MINUTES })
      : t('review.inDays', { n: next.interval_days });
  print(dim(t('review.next', { when })));
  session?.record(rating > 0, rating > 0 ? 3 + rating : 1);
  return rating;
}

/** Dictation item from the `words` table. */
export async function runDictationItem(ctx: Ctx, item: WordsRow, session: Session | null): Promise<boolean> {
  blank();
  print(c.bold.cyan(`◆ ${t('ex.dictation')}`) + dim(`  [${item.level}]`));
  const { given, result } = await askDictation(item.sentence, JSON.parse(item.hidden_words_json) as string[]);
  printDictationDiff(result);
  print(dim(t('ex.dictationScore', { pct: `${Math.round(result.accuracy * 100)}%` })));
  if (result.correct) ok(t('ex.correct'));
  else {
    bad(t('ex.wrong', { expected: item.sentence }));
    ctx.store.addMistake({
      exercise_id: null,
      question: `Dictation: ${item.sentence}`,
      given_answer: given,
      correct_answer: item.sentence,
      explanation: 'Listen for small words (articles, prepositions, auxiliaries) and endings (-s, -ed).',
    });
  }
  session?.record(result.correct, xpFor(8, result.correct, false, streakNow(ctx)));
  return result.correct;
}
