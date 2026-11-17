import { getLocale, setLocale, t } from './i18n.js';
import { connectCloud, loadLocal, onSync, resetAll, S, UNIT, type SyncStatus } from './state.js';
import {
  dailySteps,
  dictationSteps,
  lessonSteps,
  mistakeSteps,
  reviewSteps,
  runSession,
  type Plan,
} from './practice.js';
import {
  homeView,
  lessonsView,
  mistakesView,
  onboardingView,
  progressView,
  settingsView,
  type Start,
} from './views.js';
import { chatView, explainView, writeView } from './ai.js';
import { btn, clear, h, icon, svg } from './ui.js';

// Hash routes (claude.ai reserves "settings", so preferences live at #prefs).
const ROUTES = ['', 'lessons', 'progress', 'mistakes', 'chat', 'write', 'explain', 'prefs', 'practice'] as const;
type Route = (typeof ROUTES)[number];

const app = document.getElementById('app')!;
const top = h('header', { class: 'topbar' });
const main = h('main', { class: 'view', id: 'view' });
app.replaceChildren(top, main);

let sync: SyncStatus = 'local';
let pendingPlan: Plan | null = null;

const route = (): Route => {
  const r = location.hash.replace(/^#/, '') as Route;
  return ROUTES.includes(r) ? r : '';
};
const go = (r: string): void => {
  if (location.hash.replace(/^#/, '') === r) render();
  else location.hash = r;
};
const goHome = (): void => {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  render();
};

const start: Start = (kind) => {
  let plan: Plan;
  if (kind === 'daily') plan = { title: t('todayPlan'), steps: dailySteps() };
  else if (kind === 'review') plan = { title: t('reviewTitle'), steps: reviewSteps() };
  else if (kind === 'dictation') plan = { title: t('tDictation'), steps: dictationSteps() };
  else if (kind === 'mistakes') plan = { title: t('mistakesTitle'), steps: mistakeSteps() };
  else if (kind === 'placement') plan = { title: t('placementTitle'), steps: [], placement: true };
  else {
    const unit = UNIT.get(kind.unit)!;
    plan = { title: unit.title, steps: lessonSteps(unit) };
  }
  if (!plan.placement && plan.steps.length === 0) {
    clear(
      main,
      h('p', { class: 'muted' }, kind === 'review' ? t('noDue') : t('noMistakes')),
      btn(t('home'), goHome, 'btn primary wide'),
    );
    return;
  }
  pendingPlan = plan;
  go('practice');
};

function topbar(r: Route): void {
  const syncText = sync === 'cloud' ? t('saved') : sync === 'saving' ? t('saving') : t('savedLocal');
  clear(
    top,
    r === ''
      ? h('span', { class: 'brand-mark small', lang: 'en', dir: 'ltr' }, 'eng')
      : btn([svg(icon.back, 'ico flip'), h('span', null, t('back'))], goHome, 'btn ghost small back'),
    h(
      'span',
      { class: `sync ${sync}`, title: syncText },
      h('span', { class: 'sync-dot' }),
      h('span', { class: 'sync-text' }, syncText),
    ),
    S.profile && r !== 'prefs' && r !== 'practice'
      ? btn(t('settings'), () => go('prefs'), 'btn ghost small')
      : h('span'),
  );
}

function render(): void {
  setLocale(S.profile?.locale ?? getLocale());
  const r = route();
  if (!S.profile) {
    top.replaceChildren();
    return onboardingView(main, (placement) => (placement ? start('placement') : goHome()), render);
  }
  topbar(r);
  main.replaceChildren();
  switch (r) {
    case 'lessons':
      return lessonsView(main, start);
    case 'progress':
      return progressView(main);
    case 'mistakes':
      return mistakesView(main, start);
    case 'chat':
      return void chatView(main);
    case 'write':
      return writeView(main);
    case 'explain':
      return explainView(main);
    case 'prefs':
      return settingsView(main, render, start, () => {
        resetAll();
        goHome();
      });
    case 'practice': {
      const plan = pendingPlan;
      pendingPlan = null;
      if (!plan) return goHome();
      return runSession(main, plan, goHome);
    }
    default:
      return homeView(main, go, start);
  }
}

onSync((s) => {
  sync = s;
  const el = top.querySelector('.sync');
  if (el) {
    el.className = `sync ${s}`;
    const txt = s === 'cloud' ? t('saved') : s === 'saving' ? t('saving') : t('savedLocal');
    el.querySelector('.sync-text')!.textContent = txt;
  }
});

window.addEventListener('hashchange', () => {
  // Leaving a session mid-way is fine: every answer is saved as it happens.
  render();
});

loadLocal();
if (route() === 'practice') history.replaceState(null, '', location.pathname + location.search);
render();
void connectCloud().then((replaced) => {
  if (replaced && route() !== 'practice') render();
});
