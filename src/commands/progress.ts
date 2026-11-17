import type { Ctx } from '../practice/context.js';
import { bar, box, c, dim, heading, pct, print, table } from '../ui/out.js';
import { t, type MessageKey } from '../i18n/index.js';
import { LEVELS } from '../types.js';
import { checkPromotion, VOCAB_MASTERY_FOR_PROMOTION } from '../engine/level.js';
import { displayStreak, localDate } from '../engine/streak.js';

/** Exercise types grouped into the four skills the app trains. */
export const SKILLS: { key: MessageKey; types: string[] }[] = [
  { key: 'skill.vocabulary', types: ['mcq'] },
  { key: 'skill.grammar', types: ['gap_fill'] },
  { key: 'skill.writing', types: ['word_order', 'translate'] },
  { key: 'skill.listening', types: ['dictation'] },
  { key: 'skill.speaking', types: ['speaking'] },
];

function skillAcc(map: Record<string, { n: number; acc: number }>, types: string[]): { n: number; acc: number | null } {
  let n = 0;
  let sum = 0;
  for (const ty of types) {
    const v = map[ty];
    if (v) {
      n += v.n;
      sum += v.acc * v.n;
    }
  }
  return { n, acc: n ? sum / n : null };
}

export function progressData(ctx: Ctx) {
  const { store } = ctx;
  const user = store.getUser()!;
  const now = new Date();
  const week = 7 * 86_400_000;
  const thisWeek = store.accuracyByType(new Date(now.getTime() - week), now);
  const lastWeek = store.accuracyByType(new Date(now.getTime() - 2 * week), new Date(now.getTime() - week));
  return {
    user: {
      name: user.name,
      level: user.level,
      target: user.target_level,
      xp: user.xp,
      streak: displayStreak(
        { streak: user.streak_count, longest: user.longest_streak, lastDate: user.last_session_date },
        localDate(now),
      ),
      longestStreak: user.longest_streak,
    },
    levels: LEVELS.map((l) => {
      const s = store.levelStats(l);
      return { level: l, ...s, promotion: checkPromotion(s) };
    }),
    vocab: { ...store.vocabCounts(), due: store.countDue(now) },
    skills: SKILLS.map((sk) => ({
      skill: sk.key.replace('skill.', ''),
      thisWeek: skillAcc(thisWeek, sk.types),
      lastWeek: skillAcc(lastWeek, sk.types),
    })),
    activity: store.activity(14, now),
    openMistakes: store.countOpenMistakes(),
    totals: store.totals(),
  };
}

export function progressCommand(ctx: Ctx, opts: { json?: boolean }): void {
  const d = progressData(ctx);
  if (opts.json) {
    print(JSON.stringify(d, null, 2));
    return;
  }
  heading(t('progress.title'));
  box(
    [
      `${c.bold(d.user.name)}`,
      `${t('progress.level')}: ${c.bold.cyan(d.user.level)}   ${t('progress.target')}: ${c.bold(d.user.target)}`,
      `${t('progress.streak')}: ${c.bold.yellow(`${d.user.streak} 🔥`)}   ${t('progress.longest')}: ${d.user.longestStreak}   ${t('progress.xp')}: ${c.bold.green(d.user.xp)}`,
      dim(t('progress.totals', d.totals)),
    ].join('\n'),
    undefined,
    'magenta',
  );

  print('', c.bold(t('progress.levels')));
  print(
    table(
      ['CEFR', t('progress.units'), '', t('progress.vocab')],
      d.levels.map((l) => [
        l.level === d.user.level ? c.bold.cyan(`▶ ${l.level}`) : `  ${l.level}`,
        `${l.unitsPassed}/${l.unitsTotal}`,
        bar(l.promotion.unitProgress, 15),
        `${l.vocabKnown}/${l.vocabTotal}`,
      ]),
    ),
  );
  print(dim(t('progress.promotion', { vocab: pct(VOCAB_MASTERY_FOR_PROMOTION) })));

  print('', c.bold(t('progress.vocab')));
  print(
    table(
      [t('progress.learning'), t('progress.known'), t('progress.mastered'), t('progress.due')],
      [[d.vocab.learning, d.vocab.known, d.vocab.mastered, d.vocab.due > 0 ? c.yellow(d.vocab.due) : 0]],
    ),
  );

  print('', c.bold(t('progress.skills')));
  print(
    table(
      [t('progress.skill'), t('progress.thisWeek'), t('progress.lastWeek'), t('progress.trend')],
      d.skills.map((s) => {
        const a = s.thisWeek.acc;
        const b = s.lastWeek.acc;
        const trend =
          a === null || b === null ? dim('—') : a > b + 0.02 ? c.green('▲') : a < b - 0.02 ? c.red('▼') : dim('=');
        return [
          t(`skill.${s.skill}` as MessageKey),
          a === null ? dim('—') : `${pct(a)} ${dim(`(${s.thisWeek.n})`)}`,
          b === null ? dim('—') : `${pct(b)} ${dim(`(${s.lastWeek.n})`)}`,
          trend,
        ];
      }),
    ),
  );

  const cal = d.activity.map((a) => (a.items === 0 ? dim('·') : a.items >= 15 ? c.green('█') : c.green('▄'))).join(' ');
  print('', `${c.bold(t('progress.week'))}  ${cal}`);
  print(`${c.bold(t('progress.mistakes'))}: ${d.openMistakes > 0 ? c.yellow(d.openMistakes) : c.green('0')}`);
}

export function vocabCommand(ctx: Ctx, query: string | undefined): void {
  heading(t('vocab.title'));
  const rows = query
    ? ctx.store.searchVocab(query, 30).map((v) => [v.word, v.ipa, v.translation, v.level, '', ''])
    : (
        ctx.db
          .prepare(
            `SELECT v.word, v.ipa, v.translation, v.level, r.due_at, r.repetitions
             FROM reviews r JOIN vocab v ON v.id = r.vocab_id ORDER BY r.due_at LIMIT 200`,
          )
          .all() as {
          word: string;
          ipa: string;
          translation: string;
          level: string;
          due_at: string;
          repetitions: number;
        }[]
      ).map((r) => [r.word, r.ipa, r.translation, r.level, localDate(new Date(r.due_at)), r.repetitions]);
  if (rows.length === 0) {
    print(t('vocab.none'));
    return;
  }
  print(table([t('vocab.word'), 'IPA', t('vocab.meaning'), 'CEFR', t('vocab.dueCol'), t('vocab.reps')], rows));
}
