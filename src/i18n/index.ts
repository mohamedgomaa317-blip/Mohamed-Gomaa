import type { Locale } from '../types.js';
import { ar } from './ar.js';
import { en, type MessageKey } from './en.js';

export type { MessageKey };

const DICTS: Record<Locale, Record<MessageKey, string>> = { ar, en };
let current: Locale = 'ar';

export function setLocale(l: Locale): void {
  current = l;
}
export function getLocale(): Locale {
  return current;
}

export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  const template = DICTS[current][key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Resolve the interface language: --lang flag > config > Arabic. */
export function resolveLocale(flag: string | undefined, configured: Locale | undefined): Locale {
  if (flag === 'en' || flag === 'ar') return flag;
  return configured ?? 'ar';
}
