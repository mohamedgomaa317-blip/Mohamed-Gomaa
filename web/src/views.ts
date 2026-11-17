import { checkPromotion, levelIndex } from '../../src/engine/level.js';
import { localDate } from '../../src/engine/streak.js';
import { LEVELS, type Level, type Locale } from '../../src/types.js';
import { getLocale, pct, setLocale, t, type Key } from './i18n.js';
import {
  dueCards,
  emptyState,
  levelStats,
  nextUnit,
  S,
  save,
  streakNow,
  typeAccuracy,
  unitProgress,
  UNITS,
  vocabCounts,
  resolveMistake,
} from './state.js';
import { planDay } from './practice.js';
import { btn, clear, en, h, icon, meter, svg } from './ui.js';

export type Go = (route: string) => void;
export type Start = (kind: 'daily' | 'review' | 'dictation' | 'mistakes' | 'placement' | { unit: string }) => void;

// ── onboarding ────────────────────────────────────────────────
export function onboardingView(root: HTMLElement, done: (placement: boolean) => void, rerender: () => void): void {
  let how: 'placement' | 'known' | 'beginner' = 'placement';
  let level: Level = 'A1';
  let target: Level = 'B2';
  let minutes = 15;

  const name = h('input', {
    id: 'ob-name',
    type: 'text',
    class: 'answer',
    placeholder: t('namePh'),
    'aria-label': t('yourName'),
    autocomplete: 'given-name',
    maxlength: 40,
  });
  const seg = <T extends string | number>(
    id: string,
    items: [T, string][],
    value: () => T,
    set: (v: T) => void,
    onChange?: () => void,
  ): HTMLElement => {
    const wrap = h('div', { class: 'seg', role: 'radiogroup', id });
    const draw = (): void => {
      clear(
        wrap,
        items.map(([v, label]) => {
          const b = btn(
            label,
            () => {
              set(v);
              draw();
              onChange?.();
            },
            `seg-btn${value() === v ? ' on' : ''}`,
          );
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(value() === v));
          return b;
        }),
      );
    };
    draw();
    return wrap;
  };
  const levelRow = h('div', { hidden: true });
  const howSeg = seg(
    'ob-how',
    [
      ['placement', t('placement')],
      ['known', t('knowLevel')],
      ['beginner', t('beginner')],
    ] as ['placement' | 'known' | 'beginner', string][],
    () => how,
    (v) => (how = v),
    () => (levelRow.hidden = how !== 'known'),
  );
  levelRow.append(
    h('label', { class: 'label' }, t('level')),
    seg(
      'ob-level',
      LEVELS.map((l) => [l, l] as [Level, string]),
      () => level,
      (v) => (level = v),
    ),
  );

  const langSeg = seg(
    'ob-lang',
    [
      ['ar', 'العربية'],
      ['en', 'English'],
    ] as [Locale, string][],
    () => getLocale(),
    (v) => {
      setLocale(v);
      rerender();
    },
  );

  clear(
    root,
    h(
      'section',
      { class: 'onboard' },
      h(
        'div',
        { class: 'brand' },
        h('span', { class: 'brand-mark', lang: 'en', dir: 'ltr' }, 'eng'),
        h('span', { class: 'muted' }, t('tagline')),
      ),
      h('p', { class: 'lead' }, t('welcome')),
      h('label', { class: 'label' }, t('language')),
      langSeg,
      h('label', { class: 'label', for: 'ob-name' }, t('yourName')),
      name,
      h('label', { class: 'label' }, t('howLevel')),
      howSeg,
      h('p', { class: 'muted small' }, t('placementHint')),
      levelRow,
      h('label', { class: 'label' }, t('target')),
      seg(
        'ob-target',
        LEVELS.map((l) => [l, l] as [Level, string]),
        () => target,
        (v) => (target = v),
      ),
      h('label', { class: 'label' }, t('minutes')),
      seg(
        'ob-min',
        [
          [10, '10'],
          [15, '15'],
          [20, '20'],
          [30, '30'],
        ] as [number, string][],
        () => minutes,
        (v) => (minutes = v),
      ),
      btn(
        t('start'),
        () => {
          const n = name.value.trim();
          if (!n) return name.focus();
          const start: Level = how === 'known' ? level : 'A1';
          Object.assign(S, emptyState());
          S.profile = {
            name: n,
            level: start,
            target: levelIndex(target) < levelIndex(start) ? start : target,
            minutes,
            locale: getLocale(),
            createdAt: new Date().toISOString(),
          };
          save();
          done(how === 'placement');
        },
        'btn primary wide',
      ),
    ),
  );
}

// ── home ──────────────────────────────────────────────────────
export function homeView(root: HTMLElement, go: Go, start: Start): void {
  const p = S.profile!;
  const plan = planDay();
  const stats = levelStats(p.level);
  const promo = checkPromotion(stats);
  const studied = S.streak.last === localDate();
  const steps: string[] = [];
  if (plan.reviews) steps.push(t('planReview', { n: plan.reviews }));
  if (plan.mistakes) steps.push(t('planMistakes', { n: plan.mistakes }));
  if (plan.unit) steps.push(t('planLesson', { title: plan.unit.title }));
  if (plan.dictation) steps.push(t('planDictation'));
  if (plan.dialogue && plan.unit) steps.push(t('planDialogue'));
  const due = dueCards().length;

  const tile = (title: Key, sub: string, onclick: () => void, extra = ''): HTMLButtonElement =>
    btn([h('strong', null, t(title)), h('span', { class: 'muted small' }, sub)], onclick, `tile ${extra}`.trim());

  clear(
    root,
    h(
      'section',
      { class: 'hero' },
      h(
        'div',
        { class: 'hero-top' },
        h('h2', null, t('hi', { name: p.name })),
        h('span', { class: 'streak', title: t('streak') }, svg(icon.flame), String(streakNow())),
      ),
      h(
        'div',
        { class: 'levelline' },
        h('span', { class: 'level-badge', lang: 'en', dir: 'ltr' }, p.level),
        h(
          'div',
          { class: 'grow' },
          h(
            'p',
            { class: 'small' },
            t(p.level as Key),
            ' · ',
            t('unitsPassed', { a: stats.unitsPassed, b: stats.unitsTotal }),
            ' · ',
            t('xp', { n: S.xp }),
          ),
          meter((promo.unitProgress + Math.min(1, promo.vocabProgress / 0.6)) / 2),
        ),
      ),
    ),
    h(
      'section',
      { class: 'today' },
      h('p', { class: 'eyebrow' }, t('todayPlan'), ' · ', `${p.minutes}′`),
      steps.length
        ? h(
            'ol',
            { class: 'plan' },
            steps.map((s) => h('li', null, s)),
          )
        : h('p', { class: 'muted' }, t('allUnitsDone', { level: p.level })),
      studied ? h('p', { class: 'muted small' }, t('doneToday')) : null,
      btn(t('startSession'), () => start('daily'), 'btn primary wide big-btn'),
    ),
    h('p', { class: 'eyebrow' }, t('practice')),
    h(
      'div',
      { class: 'tiles' },
      tile('tReview', t('tReviewSub', { n: due }), () => start('review'), due ? 'attn' : ''),
      tile('tUnits', t('tUnitsSub'), () => go('lessons')),
      tile('tDictation', t('tDictationSub'), () => start('dictation')),
      tile('tChat', t('tChatSub'), () => go('chat')),
      tile('tWrite', t('tWriteSub'), () => go('write')),
      tile('tExplain', t('tExplainSub'), () => go('explain')),
      tile(
        'tMistakes',
        t('tMistakesSub', { n: S.mistakes.length }),
        () => go('mistakes'),
        S.mistakes.length ? 'attn' : '',
      ),
      tile('tProgress', t('tProgressSub'), () => go('progress')),
    ),
  );
}

// ── lessons ───────────────────────────────────────────────────
export function lessonsView(root: HTMLElement, start: Start): void {
  const current = S.profile!.level;
  const next = nextUnit(current);
  clear(
    root,
    h('h2', null, t('unitsTitle')),
    LEVELS.map((l) =>
      h(
        'section',
        { class: 'level-group' },
        h(
          'h3',
          { class: 'level-head' },
          h('span', { class: `level-badge${l === current ? '' : ' dim'}`, lang: 'en', dir: 'ltr' }, l),
          t(l as Key),
        ),
        h(
          'ul',
          { class: 'units' },
          UNITS.filter((u) => u.level === l).map((u) => {
            const pr = unitProgress(u);
            const state = pr.passed ? 'passed' : pr.attempted ? 'started' : '';
            return h(
              'li',
              null,
              btn(
                [
                  h('span', { class: `dot ${state}${next?.id === u.id ? ' next' : ''}` }),
                  h(
                    'span',
                    { class: 'grow' },
                    h('strong', null, en(u.title)),
                    h('span', { class: 'muted small' }, en(`${u.id} · ${u.grammar.map((g) => g.name).join(' · ')}`)),
                  ),
                  h('span', { class: 'pct' }, pr.attempted ? pct(pr.accuracy) : ''),
                ],
                () => start({ unit: u.id }),
                'unit-row',
              ),
            );
          }),
        ),
      ),
    ),
  );
}

// ── progress ──────────────────────────────────────────────────
const SKILLS: [Key, string[]][] = [
  ['sMcq', ['mcq']],
  ['sGap', ['gap_fill']],
  ['sWriting', ['word_order', 'translate', 'writing']],
  ['sListening', ['dictation']],
  ['sSpeaking', ['speaking', 'dialogue', 'chat']],
];

export function progressView(root: HTMLElement): void {
  const p = S.profile!;
  const vc = vocabCounts();
  const now = typeAccuracy(7, 0);
  const before = typeAccuracy(14, 7);
  const agg = (m: Record<string, [number, number]>, types: string[]): [number, number] =>
    types.reduce<[number, number]>((a, ty) => [a[0] + (m[ty]?.[0] ?? 0), a[1] + (m[ty]?.[1] ?? 0)], [0, 0]);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = localDate(new Date(Date.now() - (13 - i) * 86_400_000));
    return { d, n: S.days[d]?.items ?? 0 };
  });
  const maxN = Math.max(10, ...days.map((x) => x.n));

  clear(
    root,
    h('h2', null, t('progressTitle')),
    h(
      'dl',
      { class: 'stats' },
      h('div', { class: 'stat' }, h('dt', null, t('streak')), h('dd', null, String(streakNow()))),
      h('div', { class: 'stat' }, h('dt', null, t('xpEarned')), h('dd', null, String(S.xp))),
      h(
        'div',
        { class: 'stat' },
        h('dt', null, t('level')),
        h('dd', { lang: 'en', dir: 'ltr' }, `${p.level} → ${p.target}`),
      ),
    ),
    h('p', { class: 'eyebrow' }, t('ladder')),
    h(
      'ol',
      { class: 'ladder' },
      [...LEVELS].reverse().map((l) => {
        const st = levelStats(l);
        const pr = checkPromotion(st);
        const cls = l === p.level ? 'current' : levelIndex(l) < levelIndex(p.level) ? 'done' : '';
        return h(
          'li',
          { class: `rung ${cls}` },
          h('span', { class: 'level-badge', lang: 'en', dir: 'ltr' }, l),
          h(
            'div',
            { class: 'grow' },
            h(
              'p',
              { class: 'small' },
              t(l as Key),
              ' · ',
              t('unitsPassed', { a: st.unitsPassed, b: st.unitsTotal }),
              ' · ',
              t('wordsKnown', { a: st.vocabKnown, b: st.vocabTotal }),
            ),
            meter(pr.unitProgress),
          ),
        );
      }),
    ),
    h('p', { class: 'muted small' }, t('promoRule')),
    h('p', { class: 'eyebrow' }, t('vocab')),
    h(
      'dl',
      { class: 'stats four' },
      [
        [t('inReview'), vc.learning],
        [t('known'), vc.known],
        [t('mastered'), vc.mastered],
        [t('due'), dueCards().length],
      ].map(([a, b]) => h('div', { class: 'stat' }, h('dt', null, String(a)), h('dd', null, String(b)))),
    ),
    h('p', { class: 'eyebrow' }, t('skills')),
    h(
      'ul',
      { class: 'skills' },
      SKILLS.map(([k, types]) => {
        const [n1, c1] = agg(now, types);
        const [n0, c0] = agg(before, types);
        const a1 = n1 ? c1 / n1 : null;
        const a0 = n0 ? c0 / n0 : null;
        const trend = a1 === null || a0 === null ? '' : a1 > a0 + 0.02 ? '▲' : a1 < a0 - 0.02 ? '▼' : '=';
        return h(
          'li',
          null,
          h('span', { class: 'grow' }, t(k)),
          h('span', { class: 'num' }, a1 === null ? '—' : pct(a1)),
          h('span', { class: 'num muted' }, a0 === null ? '—' : pct(a0)),
          h('span', { class: `trend ${trend === '▲' ? 'up' : trend === '▼' ? 'down' : ''}` }, trend),
        );
      }),
    ),
    h('p', { class: 'eyebrow' }, t('last14')),
    h(
      'div',
      { class: 'spark', dir: 'ltr', role: 'img', 'aria-label': days.map((x) => `${x.d}: ${x.n}`).join(', ') },
      days.map((x) => h('span', { style: `block-size:${Math.max(6, (x.n / maxN) * 100)}%`, class: x.n ? 'on' : '' })),
    ),
  );
}

// ── mistakes ──────────────────────────────────────────────────
export function mistakesView(root: HTMLElement, start: Start): void {
  if (!S.mistakes.length)
    return clear(root, h('h2', null, t('mistakesTitle')), h('p', { class: 'good' }, t('noMistakes')));
  clear(
    root,
    h('h2', null, t('mistakesTitle')),
    S.mistakes.some((m) => m.exId) ? btn(t('practiseMistakes'), () => start('mistakes'), 'btn primary wide') : null,
    h(
      'ul',
      { class: 'mistakes' },
      [...S.mistakes].reverse().map((m) =>
        h(
          'li',
          { class: 'card' },
          h('p', { dir: 'auto' }, m.q),
          h(
            'p',
            { class: 'small' },
            h('span', { class: 'muted' }, t('youWrote'), ': '),
            h('s', null, en(m.given || '—')),
          ),
          h('p', { class: 'small' }, '✓ ', en(m.ans.split('|')[0]!, 'strong')),
          m.expl ? h('p', { class: 'muted small' }, en(m.expl)) : null,
          !m.exId
            ? btn(
                '✓',
                () => {
                  resolveMistake(m.id);
                  save();
                  mistakesView(root, start);
                },
                'btn ghost small',
              )
            : null,
        ),
      ),
    ),
  );
}

// ── settings ──────────────────────────────────────────────────
export function settingsView(root: HTMLElement, rerender: () => void, start: Start, reset: () => void): void {
  const p = S.profile!;
  const seg = <T extends string | number>(items: [T, string][], cur: T, set: (v: T) => void): HTMLElement =>
    h(
      'div',
      { class: 'seg' },
      items.map(([v, label]) =>
        btn(
          label,
          () => {
            set(v);
            save();
            rerender();
          },
          `seg-btn${cur === v ? ' on' : ''}`,
        ),
      ),
    );
  let armed = false;
  const resetBtn = btn(
    t('reset'),
    () => {
      if (!armed) {
        armed = true;
        resetBtn.textContent = t('resetConfirm');
        return;
      }
      reset();
    },
    'btn danger wide',
  );
  clear(
    root,
    h('h2', null, t('settings')),
    h('label', { class: 'label' }, t('language')),
    seg(
      [
        ['ar', 'العربية'],
        ['en', 'English'],
      ] as [Locale, string][],
      p.locale,
      (v) => {
        p.locale = v;
        setLocale(v);
      },
    ),
    h('label', { class: 'label' }, t('level')),
    seg(
      LEVELS.map((l) => [l, l] as [Level, string]),
      p.level,
      (v) => (p.level = v),
    ),
    h('label', { class: 'label' }, t('target')),
    seg(
      LEVELS.map((l) => [l, l] as [Level, string]),
      p.target,
      (v) => (p.target = v),
    ),
    h('label', { class: 'label' }, t('minutes')),
    seg(
      [
        [10, '10'],
        [15, '15'],
        [20, '20'],
        [30, '30'],
      ] as [number, string][],
      p.minutes,
      (v) => (p.minutes = v),
    ),
    btn(t('retakePlacement'), () => start('placement'), 'btn secondary wide'),
    resetBtn,
  );
}
