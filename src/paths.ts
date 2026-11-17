import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `ENG_HOME` overrides `~/.eng` (used by tests and for portable installs). */
export function engHome(): string {
  return process.env.ENG_HOME ?? join(homedir(), '.eng');
}
export const dbPath = (): string => join(engHome(), 'data.db');
export const configPath = (): string => join(engHome(), 'config.json');

/** Package root (works from both `src/` via vitest and `dist/` after build). */
export function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}
export const migrationsDir = (): string => join(packageRoot(), 'migrations');
