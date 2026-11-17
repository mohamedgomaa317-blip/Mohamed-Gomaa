/**
 * The practice engine: a session is a stream of steps (exercises, word
 * cards, dictation, dialogue turns, lesson intros) rendered one at a time.
 */
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
} from '../../src/engine/grading.js';
import { ratingFromGrade, RELEARN_MINUTES, type Rating } from '../../src/engine/srs.js';
import { xpFor } from '../../src/engine/streak.js';
import {
  placementResult,
  startPlacement,
  stepPlacement,
  PLACEMENT_BLOCK,
  UNIT_PASS_MARK,
} from '../../src/engine/level.js';
import type { DictationSeed, Level, UnitSeed } from '../../src/types.js';
import { getLocale, pct, t, type Key } from './i18n.js';
import { mic, speak, type Mic } from './platform.js';
import {
  addFreeMistake,
  countItem,
  dueCards,
  EX,
  introduceWord,
  maybePromote,
  nextUnit,
  rateCard,
  recordExercise,
  S,
  save,
  streakNow,
  unitProgress,
  UNITS,
  WORD,
  type Ex,
  type Word,
} from './state.js';
import { btn, clear, en, h, meter, svg, icon } from './ui.js';

let micP: Promise<Mic | null> | null = null;
const getMic = (): Promise<Mic | null> => (micP ??= mic());

// ── steps & sessions ──────────────────────────────────────────
export type Step =
  | { k: 'grammar'; unit: UnitSeed }
  | { k: 'words'; unit: UnitSeed }
  | { k: 'quick'; word: Word; options: Word[] }
  | { k: 'ex'; ex: Ex; record?: boolean }
  | { k: 'card'; id: string }
  | { k: 'dict'; d: DictationSeed & { level: Level } }
  | { k: 'dialogue'; unit: UnitSeed }
  | { k: 'unitResult'; unit: UnitSeed };

export interface Plan {
  title: string;
  steps: Step[];
  /** Placement uses a dynamic flow instead of a fixed list. */
  placement?: boolean;
  onDone?: () => void;
}

interface Tally {
  items: number;
  correct: number;
  xp: number;
}

function addTally(tally: Tally, type: string, correct: boolean, xp: number): void {
  tally.items++;
  if (correct) tally.correct++;
  tally.xp += xp;
  countItem(type, correct, xp);
  save();
}

// ── building plans ────────────────────────────────────────────
export function lessonSteps(unit: UnitSeed, maxExercises?: number, withDialogue = true): Step[] {
  const steps: Step[] = [];
  if (!S.intro[unit.id]) {
    steps.push({ k: 'grammar', unit }, { k: 'words', unit });
    const words = unit.vocab.map((v) => WORD.get(v.id)!);
    if (words.length >= 4) {
      for (const w of shuffle(words).slice(0, 3)) {
        steps.push({
          k: 'quick',
          word: w,
          options: shuffle([w, ...shuffle(words.filter((o) => o.id !== w.id)).slice(0, 3)]),
        });
      }
    }
  }
  const passed = unitProgress(unit).passed;
  let todo = unit.exercises.filter((e) => passed || S.ex[e.id]?.[0] !== 1).map((e) => EX.get(e.id)!);
  if (maxExercises !== undefined) todo = todo.slice(0, maxExercises);
  steps.push(...todo.map((ex): Step => ({ k: 'ex', ex })));
  steps.push({ k: 'unitResult', unit });
  if (withDialogue) steps.push({ k: 'dialogue', unit });
  return steps;
}

export interface DayPlan {
  reviews: number;
  mistakes: number;
  unit: UnitSeed | null;
  lessonExercises: number | undefined;
  dictation: boolean;
  dialogue: boolean;
}

/** Same budget as the CLI: a card ≈ 20 s, a mistake ≈ 40 s, a lesson ≈ its minutes. */
export function planDay(): DayPlan {
  const p = S.profile!;
  const minutes = p.minutes;
  const due = dueCards().length;
  const openEx = S.mistakes.filter((m) => m.exId).length;
  const unit = nextUnit(p.level);
  const reviews = Math.min(due, Math.max(5, Math.floor((minutes * 60 * 0.3) / 20)), 30);
  const mistakes = Math.min(openEx, minutes >= 15 ? 3 : 2);
  const left = minutes - (reviews * 20 + mistakes * 40) / 60;
  const full = unit ? left >= unit.minutes * 0.8 : false;
  return {
    reviews,
    mistakes,
    unit,
    lessonExercises: unit && !full ? Math.max(2, Math.floor(left / 1.5)) : undefined,
    dictation: minutes >= 10,
    dialogue: minutes >= 20,
  };
}

export function dailySteps(): Step[] {
  const plan = planDay();
  const steps: Step[] = [];
  for (const id of dueCards().slice(0, plan.reviews)) steps.push({ k: 'card', id });
  for (const m of S.mistakes.filter((x) => x.exId).slice(0, plan.mistakes)) {
    const ex = EX.get(m.exId!);
    if (ex) steps.push({ k: 'ex', ex });
  }
  if (plan.unit) steps.push(...lessonSteps(plan.unit, plan.lessonExercises, false));
  if (plan.dictation) {
    const pool = UNITS.filter((u) => u.level === S.profile!.level).flatMap((u) =>
      u.dictation.map((d) => ({ ...d, level: u.level })),
    );
    if (pool.length)
      steps.push({ k: 'dict', d: pool[(Object.keys(S.days).length + new Date().getDate()) % pool.length]! });
  }
  if (plan.dialogue && plan.unit) steps.push({ k: 'dialogue', unit: plan.unit });
  return steps;
}

export function dictationSteps(n = 3): Step[] {
  const level = S.profile!.level;
  return shuffle(
    UNITS.filter((u) => u.level === level).flatMap((u) => u.dictation.map((d) => ({ ...d, level: u.level }))),
  )
    .slice(0, n)
    .map((d): Step => ({ k: 'dict', d }));
}

export function reviewSteps(): Step[] {
  return dueCards()
    .slice(0, 30)
    .map((id): Step => ({ k: 'card', id }));
}

export function mistakeSteps(): Step[] {
  return S.mistakes.filter((m) => m.exId && EX.has(m.exId)).map((m): Step => ({ k: 'ex', ex: EX.get(m.exId!)! }));
}

// ── the runner ────────────────────────────────────────────────
export function runSession(root: HTMLElement, plan: Plan, goHome: () => void): void {
  const tally: Tally = { items: 0, correct: 0, xp: 0 };
  const startLevel = S.profile?.level;
  let i = 0;
  const bar = h('div', { class: 'session-bar' });
  const stage = h('div', { class: 'stage' });
  const quit = btn(t('quit'), () => finish(), 'btn ghost small');
  clear(root, h('div', { class: 'session-head' }, h('h2', { class: 'session-title' }, plan.title), quit), bar, stage);

  const total = plan.steps.length;
  const showBar = (): void => clear(bar, meter(total ? i / total : 0));

  const next = (): void => {
    if (i >= plan.steps.length) return finish();
    showBar();
    const step = plan.steps[i++]!;
    stage.replaceChildren();
    window.scrollTo({ top: 0 });
    renderStep(stage, step, tally, next);
  };

  const finish = (): void => {
    const up = tally.items > 0 ? maybePromote() : null;
    save();
    plan.onDone?.();
    const acc = tally.items ? tally.correct / tally.items : 0;
    clear(
      root,
      h(
        'section',
        { class: 'summary' },
        h('h2', null, t('summary')),
        h(
          'dl',
          { class: 'stats' },
          stat(t('items'), String(tally.items)),
          stat(t('acc'), tally.items ? pct(acc) : '—'),
          stat(t('xpEarned'), `+${tally.xp}`),
          stat(t('streak'), String(streakNow())),
        ),
        up && up !== startLevel ? h('p', { class: 'levelup' }, t('levelUp', { level: up })) : null,
        btn(t('home'), goHome, 'btn primary wide'),
      ),
    );
  };

  if (plan.placement) return runPlacement(stage, bar, goHome, plan.onDone);
  next();
}

function stat(label: string, value: string): HTMLElement {
  return h('div', { class: 'stat' }, h('dt', null, label), h('dd', null, value));
}

function renderStep(stage: HTMLElement, step: Step, tally: Tally, next: () => void): void {
  switch (step.k) {
    case 'grammar':
      return grammarStep(stage, step.unit, next);
    case 'words':
      return wordsStep(stage, step.unit, next);
    case 'quick':
      return quickStep(stage, step.word, step.options, next);
    case 'ex':
      return exerciseStep(
        stage,
        step.ex,
        (r) => {
          if (step.record !== false)
            addTally(tally, step.ex.type, r.correct, xpFor(step.ex.points ?? 10, r.correct, r.almost, streakNow()));
        },
        next,
      );
    case 'card':
      return cardStep(stage, step.id, tally, next);
    case 'dict':
      return dictStep(stage, step.d, tally, next);
    case 'dialogue':
      return dialogueStep(stage, step.unit, tally, next);
    case 'unitResult': {
      const p = unitProgress(step.unit);
      clear(
        stage,
        h(
          'section',
          { class: 'card center' },
          h('p', { class: 'eyebrow' }, `${step.unit.level} · ${step.unit.id}`),
          h('h3', null, en(step.unit.title)),
          h('p', { class: 'big' }, t('unitResult', { x: pct(p.accuracy) })),
          meter(p.accuracy),
          h('p', { class: p.passed ? 'good' : 'muted' }, p.passed ? t('unitPassed') : t('unitNotPassed')),
          btn(t('next'), next, 'btn primary wide'),
        ),
      );
      return;
    }
  }
}

// ── lesson intro steps ────────────────────────────────────────
function grammarStep(stage: HTMLElement, unit: UnitSeed, next: () => void): void {
  clear(
    stage,
    h('p', { class: 'eyebrow' }, `${t('grammar')} · ${unit.level}`),
    h('h3', { class: 'unit-title' }, en(unit.title)),
    unit.grammar.map((g) =>
      h(
        'article',
        { class: 'card grammar' },
        h('h4', null, en(g.name)),
        h('p', null, en(g.rule)),
        getLocale() === 'ar' ? h('p', { class: 'ar-note', dir: 'rtl', lang: 'ar' }, g.ar) : null,
        h(
          'ul',
          { class: 'examples' },
          g.examples.map((x) => h('li', null, speakBtn(x), en(x))),
        ),
      ),
    ),
    btn(t('continue'), next, 'btn primary wide'),
  );
}

function wordsStep(stage: HTMLElement, unit: UnitSeed, next: () => void): void {
  for (const v of unit.vocab) introduceWord(v.id);
  S.intro[unit.id] = 1;
  save();
  clear(
    stage,
    h('p', { class: 'eyebrow' }, t('newWords')),
    h(
      'ul',
      { class: 'wordlist' },
      unit.vocab.map((v) =>
        h(
          'li',
          { class: 'word' },
          speakBtn(v.word),
          h(
            'div',
            null,
            h('p', { class: 'w' }, en(v.word, 'strong'), ' ', h('span', { class: 'ipa', dir: 'ltr' }, v.ipa)),
            h('p', { class: 'tr', lang: 'ar', dir: 'rtl' }, v.translation),
            h('p', { class: 'muted' }, en(`“${v.example}”`)),
          ),
        ),
      ),
    ),
    btn(t('continue'), next, 'btn primary wide'),
  );
}

function quickStep(stage: HTMLElement, word: Word, options: Word[], next: () => void): void {
  const fb = h('div', { class: 'feedback' });
  const opts = options.map((o) =>
    btn(
      h('span', { lang: 'ar', dir: 'rtl' }, o.translation),
      () => {
        for (const b of opts) b.disabled = true;
        const ok = o.id === word.id;
        opt(o).classList.add(ok ? 'is-right' : 'is-wrong');
        if (!ok) opt(word).classList.add('is-right');
        clear(
          fb,
          h('p', { class: ok ? 'good' : 'bad' }, ok ? t('correct') : `${t('wrong')} ${word.translation}`),
          btn(t('next'), next, 'btn primary wide'),
        );
      },
      'option',
    ),
  );
  const opt = (w: Word): HTMLButtonElement => opts[options.indexOf(w)]!;
  clear(
    stage,
    h('p', { class: 'eyebrow' }, t('exMcq')),
    h('h3', { class: 'prompt' }, t('quickCheck', { w: word.word })),
    h('div', { class: 'options' }, opts),
    fb,
  );
}

// ── exercises ─────────────────────────────────────────────────
const TYPE_LABEL: Record<string, Key> = {
  mcq: 'exMcq',
  gap_fill: 'exGap',
  word_order: 'exOrder',
  translate: 'exTranslate',
  dictation: 'exDictation',
  speaking: 'exSpeaking',
};

export interface Outcome {
  correct: boolean;
  almost: boolean;
}

function feedbackBlock(r: GradeResult, explanation: string): HTMLElement {
  const ok = r.correct && !r.almost;
  return h(
    'div',
    { class: `verdict ${r.correct ? 'is-good' : 'is-bad'}` },
    h(
      'p',
      { class: 'verdict-head' },
      ok ? t('correct') : r.almost ? t('almost', { x: '' }).replace(/[:：]\s*$/, '') : t('wrong'),
    ),
    !ok ? h('p', { class: 'expected' }, en(r.expected)) : null,
    !ok && explanation ? h('p', { class: 'why' }, h('strong', null, `${t('why')}: `), en(explanation)) : null,
  );
}

/** Render one exercise. `onGraded` fires once with the result; `next` continues the session. */
export function exerciseStep(stage: HTMLElement, ex: Ex, onGraded: (r: Outcome) => void, next: () => void): void {
  const options = ex.options ?? [];
  const fb = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const head = h('p', { class: 'eyebrow' }, t(TYPE_LABEL[ex.type]!), h('span', { class: 'chip' }, ex.level));
  let graded = false;

  const conclude = (r: GradeResult, given: string, question: string, extra?: HTMLElement): void => {
    if (graded) return;
    graded = true;
    onGraded({ correct: r.correct, almost: r.almost });
    recordExercise(ex, r.correct, given, r.expected, question);
    save();
    const nextBtn = btn(t('next'), next, 'btn primary wide');
    clear(fb, feedbackBlock(r, ex.explanation), extra ?? null, nextBtn);
    nextBtn.focus({ preventScroll: true });
    fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const textInput = (multi = false): HTMLInputElement | HTMLTextAreaElement => {
    const attrs = {
      id: `ans-${ex.id}`,
      class: 'answer',
      lang: 'en',
      dir: 'ltr',
      autocomplete: 'off',
      autocapitalize: 'sentences',
      spellcheck: false,
      placeholder: t('answerPh'),
      'aria-label': t('answerPh'),
    };
    const el = multi
      ? h('textarea', { ...attrs, rows: 3 })
      : h('input', { ...attrs, type: 'text', enterkeyhint: 'done' });
    if (!multi) el.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && checkBtn.click());
    return el;
  };
  let checkBtn: HTMLButtonElement = btn(t('check'), () => undefined);

  switch (ex.type) {
    case 'mcq': {
      const shuffled = shuffle(options);
      const buttons = shuffled.map((o) =>
        btn(
          en(o),
          () => {
            buttons.forEach((b) => (b.disabled = true));
            const r = gradeMcq(o, options, ex.answer);
            buttons[shuffled.indexOf(o)]!.classList.add(r.correct ? 'is-right' : 'is-wrong');
            const right = shuffled.findIndex((x) => gradeMcq(x, options, ex.answer).correct);
            if (right >= 0) buttons[right]!.classList.add('is-right');
            conclude(r, o, ex.prompt);
          },
          'option',
        ),
      );
      clear(stage, head, h('h3', { class: 'prompt' }, en(ex.prompt)), h('div', { class: 'options' }, buttons), fb);
      return;
    }
    case 'gap_fill':
    case 'translate': {
      const input = textInput();
      checkBtn = btn(
        t('check'),
        () => {
          if (!input.value.trim()) return input.focus();
          input.readOnly = true;
          checkBtn.hidden = true;
          conclude(gradeText(input.value, ex.answer, ex.type === 'translate' ? 0.12 : 0.15), input.value, ex.prompt);
        },
        'btn primary wide',
      );
      const prompt =
        ex.type === 'translate'
          ? h('h3', { class: 'prompt ar-prompt', lang: 'ar', dir: 'rtl' }, ex.prompt)
          : h('h3', { class: 'prompt' }, en(ex.prompt));
      clear(stage, head, prompt, input, checkBtn, fb);
      input.focus({ preventScroll: true });
      return;
    }
    case 'word_order': {
      const pool = shuffle(options.map((w, idx) => ({ w, idx })));
      const picked: { w: string; idx: number }[] = [];
      const line = h('div', { class: 'order-line', dir: 'ltr', lang: 'en' });
      const bank = h('div', { class: 'order-bank', dir: 'ltr', lang: 'en' });
      const draw = (): void => {
        clear(
          line,
          picked.length
            ? picked.map((p, k) =>
                btn(
                  p.w,
                  () => {
                    if (graded) return;
                    picked.splice(k, 1);
                    draw();
                  },
                  'token in-line',
                ),
              )
            : h('span', { class: 'placeholder' }, '…'),
        );
        clear(
          bank,
          pool.map((p) => {
            const used = picked.includes(p);
            const b = btn(
              p.w,
              () => {
                if (graded || used) return;
                picked.push(p);
                draw();
              },
              `token${used ? ' used' : ''}`,
            );
            b.disabled = used;
            return b;
          }),
        );
        checkBtn.disabled = picked.length === 0;
      };
      checkBtn = btn(
        t('check'),
        () => {
          const given = picked.map((p) => p.w).join(' ');
          checkBtn.hidden = true;
          conclude(gradeWordOrder(given, ex.answer), given, options.join(' / '));
        },
        'btn primary wide',
      );
      const tools = h(
        'div',
        { class: 'row' },
        btn(
          t('undo'),
          () => {
            if (!graded) {
              picked.pop();
              draw();
            }
          },
          'btn ghost small',
        ),
        btn(
          t('clear'),
          () => {
            if (!graded) {
              picked.length = 0;
              draw();
            }
          },
          'btn ghost small',
        ),
      );
      draw();
      clear(stage, head, line, bank, tools, checkBtn, fb);
      return;
    }
    case 'dictation': {
      const box = dictationBox(ex.answer, []);
      checkBtn = btn(
        t('check'),
        () => {
          if (!box.input.value.trim()) return box.input.focus();
          box.input.readOnly = true;
          checkBtn.hidden = true;
          const r = gradeDictation(box.input.value, ex.answer);
          conclude(
            { correct: r.correct, almost: false, expected: ex.answer, score: r.accuracy },
            box.input.value,
            `Dictation: ${ex.answer}`,
            diffView(r),
          );
        },
        'btn primary wide',
      );
      box.input.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && checkBtn.click());
      clear(stage, head, box.el, checkBtn, fb);
      return;
    }
    case 'speaking': {
      const input = textInput(true);
      const micRow = h('div', { class: 'row' });
      void getMic().then((m) => {
        if (!m) return clear(micRow, h('p', { class: 'muted small' }, t('keyboardMic')));
        let listening = false;
        const b = btn(
          [svg(icon.mic), h('span', null, t('micStart'))],
          () => {
            if (listening) return m.stop();
            m.start(
              (text) => (input.value = text),
              (on) => {
                listening = on;
                b.classList.toggle('live', on);
                b.lastElementChild!.textContent = on ? t('micStop') : t('micStart');
              },
            );
          },
          'btn ghost',
        );
        clear(micRow, b);
      });
      checkBtn = btn(
        t('check'),
        () => {
          if (!input.value.trim()) return input.focus();
          input.readOnly = true;
          checkBtn.hidden = true;
          const cov = keywordCoverage(input.value, options);
          const words = input.value.trim().split(/\s+/).length;
          const r: GradeResult = { correct: cov >= 0.5 && words >= 4, almost: false, expected: ex.answer, score: cov };
          const extra = h(
            'div',
            { class: 'model' },
            h('p', { class: 'muted' }, t('coverage', { x: pct(cov) })),
            h('p', { class: 'eyebrow' }, t('model')),
            h('p', { class: 'row' }, speakBtn(ex.answer), en(ex.answer)),
            h('p', { class: 'muted small' }, t('shadow')),
          );
          if (r.correct) r.expected = ex.answer;
          conclude(r, input.value, ex.prompt, extra);
        },
        'btn primary wide',
      );
      clear(
        stage,
        head,
        h('h3', { class: 'prompt' }, en(ex.prompt)),
        h('p', { class: 'muted small' }, t('speakHow')),
        input,
        micRow,
        checkBtn,
        fb,
      );
      return;
    }
  }
}

export function speakBtn(text: string, slow = false): HTMLButtonElement {
  const b = btn(svg(icon.speaker), () => void speak(text, slow), 'icon-btn');
  b.setAttribute('aria-label', `${t('listen')}: ${text}`);
  return b;
}

function dictationBox(sentence: string, hidden: string[]): { el: HTMLElement; input: HTMLInputElement } {
  const words = hidden.length
    ? hidden
    : (sentence.match(/[A-Za-z']+/g) ?? [])
        .filter((w) => w.length >= 5)
        .sort((a, b) => b.length - a.length)
        .slice(0, 3);
  const hint = h('p', { class: 'hint', dir: 'ltr', lang: 'en', hidden: true }, maskSentence(sentence, words));
  const input = h('input', {
    type: 'text',
    class: 'answer',
    lang: 'en',
    dir: 'ltr',
    autocomplete: 'off',
    spellcheck: false,
    placeholder: t('answerPh'),
    'aria-label': t('answerPh'),
    enterkeyhint: 'done',
  });
  const el = h(
    'div',
    null,
    h('p', { class: 'muted small' }, t('dictationHow')),
    h(
      'div',
      { class: 'row' },
      btn(
        [svg(icon.speaker), h('span', null, t('listen'))],
        async () => {
          if (!(await speak(sentence))) hint.hidden = false;
        },
        'btn secondary',
      ),
      btn(
        t('listenSlow'),
        async () => {
          if (!(await speak(sentence, true))) hint.hidden = false;
        },
        'btn ghost',
      ),
      btn('?', () => (hint.hidden = !hint.hidden), 'btn ghost small'),
    ),
    hint,
    input,
  );
  return { el, input };
}

function diffView(r: DictationResult): HTMLElement {
  return h(
    'div',
    null,
    h(
      'p',
      { class: 'diff', dir: 'ltr', lang: 'en' },
      r.diff.map((d) =>
        h('span', { class: `d-${d.status}` }, d.status === 'typo' ? `${d.given}→${d.word}` : d.word, ' '),
      ),
    ),
    h('p', { class: 'muted small' }, t('accuracy', { x: pct(r.accuracy) })),
  );
}

// ── SRS card ──────────────────────────────────────────────────
function cardStep(stage: HTMLElement, id: string, tally: Tally, next: () => void): void {
  const w = WORD.get(id);
  if (!w) return next();
  const card = S.cards[id];
  const fb = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const started = Date.now();
  const done = (rating: Rating): void => {
    const c = rateCard(id, rating);
    addTally(tally, 'vocab', rating > 0, rating > 0 ? 3 + rating : 1);
    const when = c.iv === 0 ? t('inMin') : t('inDays', { n: c.iv });
    clear(fb, h('p', { class: 'muted small' }, t('nextIn', { x: when })), btn(t('next'), next, 'btn primary wide'));
  };
  const head = h('p', { class: 'eyebrow' }, t('reviewTitle'), h('span', { class: 'chip' }, w.level));

  if (!card || card.reps === 0) {
    const back = h(
      'div',
      { class: 'card-back', hidden: true },
      h('p', { class: 'tr big', lang: 'ar', dir: 'rtl' }, w.translation),
      h('p', { class: 'muted' }, en(`“${w.example}”`)),
    );
    const rate = h(
      'div',
      { class: 'rate', hidden: true },
      h('p', { class: 'muted small' }, t('rateQ')),
      h(
        'div',
        { class: 'rate-grid' },
        (
          [
            [0, 'again'],
            [1, 'hard'],
            [2, 'good'],
            [3, 'easy'],
          ] as [Rating, Key][]
        ).map(([r, k]) =>
          btn(
            t(k),
            () => {
              rate.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
              done(r);
            },
            `rate-btn r${r}`,
          ),
        ),
      ),
    );
    const reveal = btn(
      t('reveal'),
      () => {
        reveal.hidden = true;
        back.hidden = false;
        rate.hidden = false;
      },
      'btn primary wide',
    );
    clear(
      stage,
      head,
      h(
        'div',
        { class: 'flash' },
        h('p', { class: 'flash-word' }, en(w.word)),
        h('p', { class: 'ipa', dir: 'ltr' }, w.ipa),
        speakBtn(w.word),
      ),
      back,
      reveal,
      rate,
      fb,
    );
    void speak(w.word);
    return;
  }

  const input = h('input', {
    type: 'text',
    class: 'answer',
    lang: 'en',
    dir: 'ltr',
    autocomplete: 'off',
    spellcheck: false,
    placeholder: t('typeWord'),
    'aria-label': t('typeWord'),
    enterkeyhint: 'done',
  });
  const check = btn(
    t('check'),
    () => {
      if (!input.value.trim()) return input.focus();
      input.readOnly = true;
      check.hidden = true;
      const g = gradeText(input.value, w.word);
      const rating = ratingFromGrade(g.correct && !g.almost, g.almost, Date.now() - started);
      void speak(w.word);
      stage.insertBefore(
        h(
          'div',
          { class: `verdict ${rating > 0 ? 'is-good' : 'is-bad'}` },
          h(
            'p',
            { class: 'verdict-head' },
            rating > 0 ? (g.almost ? t('almost', { x: '' }).replace(/[:：]\s*$/, '') : t('correct')) : t('wrong'),
          ),
          h('p', { class: 'expected' }, en(w.word), ' ', h('span', { class: 'ipa', dir: 'ltr' }, w.ipa)),
        ),
        fb,
      );
      done(rating);
    },
    'btn primary wide',
  );
  input.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && check.click());
  const masked = maskSentence(w.example, [w.word], '_'.repeat(Math.max(3, w.word.length)));
  clear(
    stage,
    head,
    h('p', { class: 'muted small' }, t('typeWord')),
    h('h3', { class: 'prompt ar-prompt', lang: 'ar', dir: 'rtl' }, w.translation),
    masked !== w.example ? h('p', { class: 'muted' }, en(masked)) : null,
    input,
    check,
    fb,
  );
  input.focus({ preventScroll: true });
}

// ── dictation from the word bank ──────────────────────────────
function dictStep(stage: HTMLElement, d: DictationSeed & { level: Level }, tally: Tally, next: () => void): void {
  const fb = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const box = dictationBox(d.sentence, d.hidden);
  const check = btn(
    t('check'),
    () => {
      if (!box.input.value.trim()) return box.input.focus();
      box.input.readOnly = true;
      check.hidden = true;
      const r = gradeDictation(box.input.value, d.sentence);
      addTally(tally, 'dictation', r.correct, xpFor(8, r.correct, false, streakNow()));
      if (!r.correct)
        addFreeMistake(
          `Dictation: ${d.sentence}`,
          box.input.value,
          d.sentence,
          'Listen for small words (articles, prepositions) and endings (-s, -ed).',
        );
      save();
      clear(
        fb,
        h(
          'div',
          { class: `verdict ${r.correct ? 'is-good' : 'is-bad'}` },
          h('p', { class: 'verdict-head' }, r.correct ? t('correct') : t('wrong')),
          !r.correct ? h('p', { class: 'expected' }, en(d.sentence)) : null,
        ),
        diffView(r),
        btn(t('next'), next, 'btn primary wide'),
      );
    },
    'btn primary wide',
  );
  box.input.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && check.click());
  clear(
    stage,
    h('p', { class: 'eyebrow' }, t('exDictation'), h('span', { class: 'chip' }, d.level)),
    box.el,
    check,
    fb,
  );
}

// ── scripted dialogue ─────────────────────────────────────────
export function dialogueStep(stage: HTMLElement, unit: UnitSeed, tally: Tally | null, next: () => void): void {
  const dlg = unit.dialogue;
  const thread = h('div', { class: 'thread' });
  const input = h('input', {
    type: 'text',
    class: 'answer',
    lang: 'en',
    dir: 'ltr',
    autocomplete: 'off',
    placeholder: t('chatPh'),
    'aria-label': t('chatPh'),
    enterkeyhint: 'send',
  });
  const send = btn(t('send'), () => reply(), 'btn primary');
  const composer = h('div', { class: 'composer' }, input, send);
  let turn = 0;
  const bot = (text: string): void => {
    thread.append(h('div', { class: 'bubble them' }, speakBtn(text), en(text)));
    void speak(text);
  };
  const reply = (): void => {
    const text = input.value.trim();
    if (!text) return input.focus();
    const tr = dlg.turns[turn]!;
    input.value = '';
    const cov = keywordCoverage(text, tr.expect.keywords);
    const good = cov >= 0.5 && text.split(/\s+/).length >= 3;
    const missing = tr.expect.keywords.filter((k) => keywordCoverage(text, [k]) === 0).map((k) => k.split('|')[0]);
    thread.append(
      h('div', { class: 'bubble me' }, en(text)),
      h(
        'div',
        { class: `note ${good ? 'good' : 'warn'}` },
        good ? t('goodReply') : t('tryInclude', { x: missing.join(', ') || '…' }),
        h('br'),
        h('span', { class: 'muted' }, t('natural'), ' '),
        en(tr.expect.sample),
      ),
    );
    if (tally) addTally(tally, 'dialogue', good, good ? 6 : 2);
    turn++;
    if (turn < dlg.turns.length) bot(dlg.turns[turn]!.bot);
    else composer.replaceWith(btn(t('next'), next, 'btn primary wide'));
    input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  input.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && reply());
  clear(
    stage,
    h('p', { class: 'eyebrow' }, t('chatTitle')),
    h('h3', null, en(dlg.title)),
    h('p', { class: 'muted small' }, t('scene'), ': ', en(dlg.setting)),
    thread,
    composer,
  );
  bot(dlg.turns[0]!.bot);
}

// ── placement ─────────────────────────────────────────────────
function runPlacement(stage: HTMLElement, bar: HTMLElement, goHome: () => void, onDone?: () => void): void {
  let state = startPlacement('A2');
  let block: Ex[] = [];
  let pos = 0;
  let correct = 0;
  let asked = 0;
  const begin = (): void => {
    const pool = [...EX.values()].filter(
      (e) => e.level === state.current && (e.type === 'mcq' || e.type === 'gap_fill'),
    );
    block = shuffle(pool).slice(0, PLACEMENT_BLOCK);
    pos = 0;
    correct = 0;
    ask();
  };
  const ask = (): void => {
    clear(bar, meter(Math.min(1, asked / 12)));
    if (pos >= block.length) {
      state = stepPlacement(state, correct);
      if (!state.done) return begin();
      const level = placementResult(state);
      const p = S.profile!;
      p.level = level;
      const order = ['A1', 'A2', 'B1', 'B2', 'C1'];
      if (order.indexOf(p.target) < order.indexOf(level)) p.target = level;
      save();
      onDone?.();
      clear(
        stage,
        h(
          'section',
          { class: 'card center' },
          h('p', { class: 'eyebrow' }, t('placementTitle')),
          h('p', { class: 'big' }, t('placementResult', { level: `${level} · ${t(level as Key)}` })),
          btn(t('home'), goHome, 'btn primary wide'),
        ),
      );
      return;
    }
    const ex = block[pos++]!;
    asked++;
    stage.replaceChildren();
    const label = h('p', { class: 'eyebrow' }, t('testing', { level: state.current }));
    const host = h('div');
    stage.append(label, host);
    placementQuestion(
      host,
      ex,
      (ok) => {
        if (ok) correct++;
      },
      ask,
    );
  };
  begin();
}

/** A placement question: graded but not recorded as a lesson attempt. */
function placementQuestion(host: HTMLElement, ex: Ex, onGraded: (ok: boolean) => void, next: () => void): void {
  const fb = h('div', { class: 'feedback' });
  const finish = (ok: boolean): void => {
    onGraded(ok);
    clear(
      fb,
      h(
        'p',
        { class: ok ? 'good' : 'bad' },
        ok ? t('correct') : `${t('wrong')} `,
        ok ? null : en(ex.answer.split('|')[0]!),
      ),
      btn(t('next'), next, 'btn primary wide'),
    );
  };
  if (ex.type === 'mcq') {
    const opts = shuffle(ex.options ?? []);
    const buttons = opts.map((o) =>
      btn(
        en(o),
        () => {
          buttons.forEach((b) => (b.disabled = true));
          finish(gradeMcq(o, ex.options ?? [], ex.answer).correct);
        },
        'option',
      ),
    );
    clear(host, h('h3', { class: 'prompt' }, en(ex.prompt)), h('div', { class: 'options' }, buttons), fb);
  } else {
    const input = h('input', {
      type: 'text',
      class: 'answer',
      lang: 'en',
      dir: 'ltr',
      autocomplete: 'off',
      placeholder: t('answerPh'),
      'aria-label': t('answerPh'),
    });
    const check = btn(
      t('check'),
      () => {
        if (!input.value.trim()) return input.focus();
        input.readOnly = true;
        check.hidden = true;
        finish(gradeText(input.value, ex.answer).correct);
      },
      'btn primary wide',
    );
    input.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && check.click());
    clear(host, h('h3', { class: 'prompt' }, en(ex.prompt)), input, check, fb);
  }
}

export { RELEARN_MINUTES, UNIT_PASS_MARK };
