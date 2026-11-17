import { select as iqSelect, input as iqInput, confirm as iqConfirm } from '@inquirer/prompts';
import { t } from '../i18n/index.js';

/** Thrown when the learner types `:q` — sessions catch it and save progress. */
export class QuitSession extends Error {
  constructor() {
    super('quit');
    this.name = 'QuitSession';
  }
}

export function isPromptExit(err: unknown): boolean {
  return err instanceof Error && (err.name === 'ExitPromptError' || err.name === 'AbortPromptError');
}

export async function ask(message: string, opts: { allowEmpty?: boolean; default?: string } = {}): Promise<string> {
  const value = await iqInput({
    message,
    default: opts.default,
    validate: (v) => (opts.allowEmpty || v.trim().length > 0 ? true : t('prompt.empty')),
  });
  if (value.trim() === ':q') throw new QuitSession();
  return value.trim();
}

export async function choose<T extends string | number>(
  message: string,
  choices: { name: string; value: T; description?: string }[],
): Promise<T> {
  return iqSelect<T>({ message, choices, pageSize: Math.min(12, choices.length) });
}

export async function yesNo(message: string, def = true): Promise<boolean> {
  return iqConfirm({ message, default: def });
}

export async function pause(message: string = t('prompt.continue')): Promise<void> {
  const v = await iqInput({ message });
  if (v.trim() === ':q') throw new QuitSession();
}
