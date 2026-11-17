/** Minimal DOM helpers — no framework. */
type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { class?: string; onclick?: (e: MouseEvent) => void };

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k in el && k !== 'list' && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

/** English learning content: always LTR, tagged as English, set in the reading face. */
export function en(text: string, cls = ''): HTMLSpanElement {
  return h('span', { class: `en ${cls}`.trim(), lang: 'en', dir: 'ltr' }, text);
}

export function btn(label: Child, onclick: () => void, cls = 'btn'): HTMLButtonElement {
  return h('button', { type: 'button', class: cls, onclick: () => onclick() }, label);
}

export function clear(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}

export function meter(ratio: number, label?: string): HTMLDivElement {
  const r = Math.max(0, Math.min(1, ratio));
  return h(
    'div',
    {
      class: 'meter',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(Math.round(r * 100)),
      'aria-label': label ?? '',
    },
    h('span', { style: `inline-size:${(r * 100).toFixed(1)}%` }),
  );
}

export const icon = {
  speaker:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flame:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-3 1.5-4.5 2.5-6 .3 2 1.2 3 2.2 3.4C11.5 7.5 11 5 12 2z" fill="currentColor"/></svg>',
};

export function svg(markup: string, cls = 'ico'): HTMLSpanElement {
  const s = h('span', { class: cls });
  s.innerHTML = markup;
  return s;
}
