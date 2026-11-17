/**
 * Conversation, writing coach and explanations. Claude (the page's `sample`
 * capability) when available; otherwise the offline engines from the CLI.
 */
import { checkWriting, pick } from '../../src/engine/writing.js';
import { gradeText, normalize } from '../../src/engine/grading.js';
import { WRITING_TASKS } from '../../src/content/tasks.js';
import type { GrammarPoint, Level, UnitSeed } from '../../src/types.js';
import { getLocale, t } from './i18n.js';
import { aiAvailable, askJson } from './platform.js';
import { countItem, EX, S, save, UNITS, WORD } from './state.js';
import { dialogueStep, exerciseStep, speakBtn } from './practice.js';
import { btn, clear, en, h } from './ui.js';

const LEVEL_GUIDE: Record<Level, string> = {
  A1: 'very short sentences, present simple, the 500 most common words',
  A2: 'short sentences, simple past and future, everyday vocabulary',
  B1: 'clear connected sentences, present perfect and conditionals',
  B2: 'natural fluent English with a wide range of structures',
  C1: 'sophisticated, nuanced English with idioms and hedging',
};
const explainLang = (): string =>
  getLocale() === 'ar'
    ? 'Modern Standard Arabic in a clear, friendly tone natural for Egyptian learners'
    : 'simple English';

const str = (x: unknown): string => (typeof x === 'string' ? x : '');
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

// ── conversation ──────────────────────────────────────────────
export async function chatView(root: HTMLElement): Promise<void> {
  const level = S.profile!.level;
  const ai = await aiAvailable();
  const units = UNITS.filter((u) => 'A1A2B1B2C1'.indexOf(u.level) <= 'A1A2B1B2C1'.indexOf(level)).reverse();
  const list = h(
    'div',
    { class: 'tiles' },
    ai
      ? btn(
          [h('strong', null, t('chatFree')), h('span', { class: 'muted small' }, t('chatAi'))],
          () => aiChat(root),
          'tile wide accent',
        )
      : null,
    units.map((u) =>
      btn(
        [
          h('strong', null, en(u.dialogue.title)),
          h('span', { class: 'muted small' }, `${u.level} · `, en(u.dialogue.setting)),
        ],
        () => scripted(root, u),
        'tile',
      ),
    ),
  );
  clear(
    root,
    h('h2', null, t('chatTitle')),
    h('p', { class: 'muted' }, ai ? t('chatAi') : t('chatOffline')),
    h('p', { class: 'eyebrow' }, t('chatPick')),
    list,
  );
}

function scripted(root: HTMLElement, unit: UnitSeed): void {
  const stage = h('div', { class: 'stage' });
  clear(root, stage);
  dialogueStep(stage, unit, { items: 0, correct: 0, xp: 0 }, () => void chatView(root));
}

interface ChatReply {
  reply: string;
  corrections: { original: string; better: string; explanation: string }[];
  encouragement: string;
}

function aiChat(root: HTMLElement): void {
  const level = S.profile!.level;
  const instructions = [
    `You are a warm, patient English conversation partner for an Arabic-speaking learner at CEFR ${level}.`,
    `Write "reply" only in English, using ${LEVEL_GUIDE[level]}; 1–3 sentences ending with a question that keeps the conversation going.`,
    `"corrections": real mistakes in the learner's LAST message only (max 3): {"original","better","explanation"} with the explanation in ${explainLang()}. Empty list if none; never invent mistakes.`,
    `"encouragement": one short sentence in ${explainLang()}.`,
    'Reply with only a JSON object: {"reply": "...", "corrections": [...], "encouragement": "..."}.',
  ].join('\n');
  const history: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: `${instructions}\n\n(Start the conversation with one friendly, simple question.)` },
  ];
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
  const send = btn(t('send'), () => void turn(), 'btn primary');
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
  clear(
    root,
    h('h2', null, t('chatTitle')),
    h('p', { class: 'muted small' }, t('chatAi')),
    thread,
    status,
    h('div', { class: 'composer' }, input, send),
  );

  const call = async (): Promise<ChatReply | null> => {
    status.textContent = t('thinking');
    send.disabled = true;
    const res = await askJson<ChatReply>(history);
    send.disabled = false;
    status.textContent = '';
    if (!res.ok || !str(res.data?.reply)) {
      status.textContent = t('aiFail');
      return null;
    }
    return {
      reply: str(res.data.reply),
      corrections: arr(res.data.corrections).slice(0, 3) as ChatReply['corrections'],
      encouragement: str(res.data.encouragement),
    };
  };
  const showBot = (r: ChatReply): void => {
    history.push({ role: 'assistant', content: r.reply });
    thread.append(h('div', { class: 'bubble them' }, speakBtn(r.reply), en(r.reply)));
  };
  const turn = async (): Promise<void> => {
    const text = input.value.trim();
    if (!text) return input.focus();
    input.value = '';
    thread.append(h('div', { class: 'bubble me' }, en(text)));
    history.push({ role: 'user', content: text });
    const r = await call();
    if (!r) return;
    const good = r.corrections.length === 0;
    thread.append(
      h(
        'div',
        { class: `note ${good ? 'good' : 'warn'}` },
        good
          ? t('noCorrections')
          : [
              h('strong', null, t('corrections')),
              h(
                'ul',
                null,
                r.corrections.map((c) =>
                  h(
                    'li',
                    null,
                    h('s', null, en(str(c.original))),
                    ' → ',
                    en(str(c.better), 'strong'),
                    h('br'),
                    h('span', { class: 'muted' }, str(c.explanation)),
                  ),
                ),
              ),
            ],
        r.encouragement ? h('p', { class: 'muted small' }, r.encouragement) : null,
      ),
    );
    countItem('chat', good, good ? 6 : 4);
    save();
    showBot(r);
    input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  input.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && void turn());
  void call().then((r) => r && showBot(r));
}

// ── writing coach ─────────────────────────────────────────────
interface WritingFeedback {
  corrected: string;
  errors: { original: string; correction: string; explanation: string; category: string }[];
  tips: string[];
  cefr: string;
  summary: string;
}

export function writeView(root: HTMLElement): void {
  const level = S.profile!.level;
  const tasks = WRITING_TASKS[level];
  const sel = h(
    'select',
    { id: 'write-task', class: 'select', 'aria-label': t('chooseTask') },
    h('option', { value: '' }, t('chooseTask')),
    tasks.map((x) => h('option', { value: x }, x)),
  );
  const area = h('textarea', {
    id: 'write-text',
    class: 'answer',
    rows: 8,
    lang: 'en',
    dir: 'ltr',
    placeholder: t('writePh'),
    'aria-label': t('writePh'),
  });
  const out = h('div', { 'aria-live': 'polite' });
  const go = btn(t('getFeedback'), () => void run(), 'btn primary wide');
  clear(root, h('h2', null, t('writeTitle')), sel, area, go, out);

  const run = async (): Promise<void> => {
    const text = area.value.trim();
    if (text.split(/\s+/).length < 3) return area.focus();
    go.disabled = true;
    clear(out, h('p', { class: 'muted' }, t('thinking')));
    const res = (await aiAvailable())
      ? await askJson<WritingFeedback>(
          [
            `You are an expert English writing coach for Arabic-speaking learners (level ${level}).`,
            sel.value ? `Writing task: ${sel.value}` : '',
            `Return only a JSON object: {"corrected": full corrected text keeping the learner's voice, "errors": [{"original","correction","explanation","category"}] (max 12, explanation in ${explainLang()}, category one of grammar|vocabulary|spelling|punctuation|style|word_order), "tips": exactly 3 upgrade tips in ${explainLang()} each with an English example, "cefr": your honest band A1|A2|B1|B2|C1|C2, "summary": one sentence in ${explainLang()}}.`,
            'Watch for errors typical of Arabic speakers: missing "be", articles, prepositions, agreement, comma-chained run-on sentences.',
            '',
            "Learner's text:",
            text.slice(0, 6000),
          ].join('\n'),
        )
      : ({ ok: false, code: 'unavailable' } as const);
    go.disabled = false;
    if (res.ok && str(res.data?.corrected)) {
      const f = res.data;
      const errs = arr(f.errors).slice(0, 12) as WritingFeedback['errors'];
      clear(
        out,
        h(
          'section',
          { class: 'card' },
          h('p', { class: 'eyebrow' }, t('correctedV')),
          h('p', { class: 'reading' }, en(str(f.corrected))),
        ),
        errs.length
          ? h(
              'section',
              { class: 'card' },
              h('p', { class: 'eyebrow' }, t('errors')),
              h(
                'ul',
                { class: 'errlist' },
                errs.map((e) =>
                  h(
                    'li',
                    null,
                    h('s', null, en(str(e.original))),
                    ' → ',
                    en(str(e.correction), 'strong'),
                    h('span', { class: 'chip' }, str(e.category)),
                    h('p', { class: 'muted small' }, str(e.explanation)),
                  ),
                ),
              ),
            )
          : null,
        h(
          'section',
          { class: 'card' },
          h('p', { class: 'eyebrow' }, t('tips')),
          h(
            'ol',
            null,
            arr(f.tips)
              .slice(0, 3)
              .map((x) => h('li', null, str(x))),
          ),
        ),
        h('p', { class: 'big' }, t('estLevel', { x: str(f.cefr) })),
        h('p', { class: 'muted' }, str(f.summary)),
      );
      countItem('writing', errs.length <= 2, 15);
      save();
      return;
    }
    if (res.ok === false && res.code !== 'unavailable') out.append(h('p', { class: 'muted small' }, t('aiFail')));
    const r = checkWriting(text);
    const loc = getLocale();
    clear(
      out,
      h('p', { class: 'muted small' }, t('offlineNote')),
      h(
        'section',
        { class: 'card' },
        h('p', { class: 'eyebrow' }, t('correctedV')),
        h('p', { class: 'reading' }, en(r.corrected)),
      ),
      h(
        'section',
        { class: 'card' },
        h('p', { class: 'eyebrow' }, t('errors')),
        r.issues.length
          ? h(
              'ul',
              { class: 'errlist' },
              r.issues
                .slice(0, 15)
                .map((e) =>
                  h(
                    'li',
                    null,
                    h('s', null, en(e.original)),
                    ' → ',
                    en(e.correction, 'strong'),
                    h('span', { class: 'chip' }, e.category),
                    h('p', { class: 'muted small' }, pick(loc, e.explanation)),
                  ),
                ),
            )
          : h('p', { class: 'good' }, t('noErrors')),
      ),
      h(
        'section',
        { class: 'card' },
        h('p', { class: 'eyebrow' }, t('tips')),
        h(
          'ol',
          null,
          r.tips.map((x) => h('li', null, pick(loc, x))),
        ),
      ),
      h(
        'p',
        { class: 'muted small' },
        t('stats', { w: r.stats.words, s: r.stats.sentences, l: r.stats.linkers.join(', ') || '—' }),
      ),
      h('p', { class: 'big' }, t('estLevelOffline', { x: r.cefr })),
    );
    countItem('writing', r.issues.length <= 2, 10);
    save();
  };
}

// ── explain ───────────────────────────────────────────────────
interface Explanation {
  topic: string;
  simple_english: string;
  arabic: string;
  examples: string[];
  drill: { question: string; answer: string }[];
}

function scoreGrammar(q: string, g: GrammarPoint): number {
  const terms = normalize(q)
    .split(' ')
    .filter((w) => w.length > 1);
  if (!terms.length) return 0;
  const name = normalize(g.name);
  const body = normalize(`${g.rule} ${g.examples.join(' ')}`);
  let score = 0;
  for (const term of terms) score += name.includes(term) ? 3 : body.includes(term) ? 1 : 0;
  if (name.includes(normalize(q))) score += 5;
  return score / terms.length;
}

export function explainView(root: HTMLElement): void {
  const input = h('input', {
    id: 'explain-q',
    type: 'text',
    class: 'answer',
    dir: 'auto',
    placeholder: t('explainPh'),
    'aria-label': t('explainPh'),
    enterkeyhint: 'search',
  });
  const out = h('div', { 'aria-live': 'polite' });
  const go = btn(t('explainBtn'), () => void run(), 'btn primary wide');
  input.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && go.click());
  clear(root, h('h2', null, t('explainTitle')), input, go, out);

  const run = async (): Promise<void> => {
    const q = input.value.trim();
    if (!q) return input.focus();
    go.disabled = true;
    clear(out, h('p', { class: 'muted' }, t('thinking')));
    const res = (await aiAvailable())
      ? await askJson<Explanation>(
          `Explain this English grammar point or word to an Arabic-speaking learner at CEFR ${S.profile!.level}: "${q.slice(0, 200)}".\nReturn only JSON: {"topic": short title, "simple_english": clear explanation in simple English (max 80 words), "arabic": the same in clear friendly Modern Standard Arabic mentioning common mistakes Arabic speakers make, "examples": exactly 3 natural example sentences, "drill": exactly 3 short practice questions [{"question","answer"}] with a short exact answer each}.`,
        )
      : ({ ok: false, code: 'unavailable' } as const);
    go.disabled = false;
    if (res.ok && str(res.data?.simple_english)) {
      const e = res.data;
      const drill = h('div');
      clear(
        out,
        h(
          'section',
          { class: 'card grammar' },
          h('h4', null, en(str(e.topic) || q)),
          h('p', null, en(str(e.simple_english))),
          h('p', { class: 'ar-note', lang: 'ar', dir: 'rtl' }, str(e.arabic)),
        ),
        h(
          'section',
          { class: 'card' },
          h('p', { class: 'eyebrow' }, t('examples')),
          h(
            'ul',
            { class: 'examples' },
            arr(e.examples)
              .slice(0, 3)
              .map((x) => h('li', null, speakBtn(str(x)), en(str(x)))),
          ),
        ),
        h('p', { class: 'eyebrow' }, t('drill')),
        drill,
      );
      for (const d of arr(e.drill).slice(0, 3) as Explanation['drill']) {
        const inp = h('input', {
          type: 'text',
          class: 'answer',
          lang: 'en',
          dir: 'ltr',
          autocomplete: 'off',
          placeholder: t('answerPh'),
          'aria-label': str(d.question),
        });
        const fb = h('p');
        const chk = btn(
          t('check'),
          () => {
            if (!inp.value.trim()) return;
            const ok = gradeText(inp.value, str(d.answer)).correct;
            chk.disabled = true;
            inp.readOnly = true;
            clear(
              fb,
              h('span', { class: ok ? 'good' : 'bad' }, ok ? t('correct') : `${t('wrong')} `),
              ok ? null : en(str(d.answer)),
            );
            countItem('explain', ok, ok ? 5 : 1);
            save();
          },
          'btn secondary',
        );
        drill.append(
          h('div', { class: 'card' }, h('p', null, en(str(d.question))), h('div', { class: 'composer' }, inp, chk), fb),
        );
      }
      return;
    }
    offlineExplain(out, q);
  };
}

function offlineExplain(out: HTMLElement, q: string): void {
  let best: { unit: UnitSeed; g: GrammarPoint; s: number } | null = null;
  for (const unit of UNITS)
    for (const g of unit.grammar) {
      const s = scoreGrammar(q, g);
      if (s > (best?.s ?? 0.9)) best = { unit, g, s };
    }
  const nq = normalize(q);
  const words = [...WORD.values()]
    .filter((w) => normalize(w.word).includes(nq) || w.translation.includes(q))
    .slice(0, 5);
  if (!best && !words.length) return clear(out, h('p', { class: 'muted' }, t('notFound', { q })));
  clear(
    out,
    words.length
      ? h(
          'ul',
          { class: 'wordlist' },
          words.map((w) =>
            h(
              'li',
              { class: 'word' },
              speakBtn(w.word),
              h(
                'div',
                null,
                h('p', null, en(w.word, 'strong'), ' ', h('span', { class: 'ipa', dir: 'ltr' }, w.ipa)),
                h('p', { class: 'tr', lang: 'ar', dir: 'rtl' }, w.translation),
                h('p', { class: 'muted' }, en(`“${w.example}”`)),
              ),
            ),
          ),
        )
      : null,
  );
  if (best) {
    const { unit, g } = best;
    out.append(
      h(
        'section',
        { class: 'card grammar' },
        h('h4', null, en(g.name)),
        h('p', null, en(g.rule)),
        getLocale() === 'ar' ? h('p', { class: 'ar-note', lang: 'ar', dir: 'rtl' }, g.ar) : null,
        h(
          'ul',
          { class: 'examples' },
          g.examples.map((x) => h('li', null, speakBtn(x), en(x))),
        ),
      ),
      h('p', { class: 'muted small' }, t('fromUnit', { u: `${unit.id} · ${unit.title}` })),
      h('p', { class: 'eyebrow' }, t('drill')),
    );
    const drill = unit.exercises
      .filter((e) => ['mcq', 'gap_fill', 'word_order'].includes(e.type))
      .map((e) => EX.get(e.id)!);
    let i = 0;
    const host = h('div', { class: 'stage' });
    out.append(host);
    const next = (): void => {
      if (i >= drill.length) return;
      host.replaceChildren();
      exerciseStep(
        host,
        drill[i++]!,
        (r) => {
          countItem(drill[i - 1]!.type, r.correct, r.correct ? 5 : 1);
          save();
        },
        next,
      );
    };
    next();
  }
}
