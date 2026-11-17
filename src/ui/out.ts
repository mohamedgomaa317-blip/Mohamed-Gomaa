import { Chalk, type ChalkInstance } from 'chalk';
import supportsColor from 'supports-color';
import boxen from 'boxen';
import Table from 'cli-table3';

/**
 * Colour is on only when stdout is a TTY that supports it, NO_COLOR is unset
 * and --no-color was not passed. Everything else gets plain text.
 */
export function colorLevel(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): 0 | 1 | 2 | 3 {
  if ('NO_COLOR' in env && env.NO_COLOR !== '') return 0;
  if (argv.includes('--no-color')) return 0;
  if (!process.stdout.isTTY && !env.FORCE_COLOR) return 0;
  const s = supportsColor.stdout;
  return s ? (s.level as 1 | 2 | 3) : 0;
}

export let c: ChalkInstance = new Chalk({ level: colorLevel() });

export function setColor(enabled: boolean): void {
  c = new Chalk({ level: enabled ? colorLevel() : 0 });
}

export const print = (...lines: string[]): void => {
  for (const l of lines) process.stdout.write(`${l}\n`);
};
export const blank = (): void => print('');

export const ok = (s: string): void => print(c.green(`✔ ${s}`));
export const bad = (s: string): void => print(c.red(`✘ ${s}`));
export const warn = (s: string): void => print(c.yellow(`! ${s}`));
export const info = (s: string): void => print(c.cyan(s));
export const dim = (s: string): string => c.dim(s);
export const em = (s: string): string => c.bold(s);
/** One-line notice used when the AI layer degrades to offline mode. */
export const notice = (s: string): void => print(c.yellow.dim(`ⓘ ${s}`));

export function heading(s: string): void {
  blank();
  print(c.bold.magenta(`━━ ${s} ━━`));
}

export function box(
  body: string,
  title?: string,
  color: 'cyan' | 'green' | 'magenta' | 'yellow' | 'red' = 'cyan',
): void {
  print(
    boxen(body, {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: c.level > 0 ? color : undefined,
      title,
      titleAlignment: 'left',
    }),
  );
}

export function table(head: string[], rows: (string | number)[][]): string {
  const t = new Table({
    head: head.map((h) => c.bold(h)),
    style: { head: [], border: c.level > 0 ? ['grey'] : [] },
    wordWrap: true,
  });
  for (const r of rows) t.push(r.map(String));
  return t.toString();
}

export function bar(ratio: number, width = 20): string {
  const r = Math.max(0, Math.min(1, ratio));
  const full = Math.round(r * width);
  const color = r >= 0.8 ? c.green : r >= 0.5 ? c.yellow : c.red;
  return color('█'.repeat(full)) + c.dim('░'.repeat(width - full));
}

export function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
