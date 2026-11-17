import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { LEVELS } from './types.js';
import { configPath } from './paths.js';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_TIMEOUT_MS = 45_000;

export const ConfigSchema = z.object({
  name: z.string().min(1).max(60).default('Learner'),
  targetLevel: z.enum(LEVELS).default('B2'),
  dailyMinutes: z.number().int().min(5).max(120).default(15),
  locale: z.enum(['ar', 'en']).default('ar'),
  tts: z.boolean().default(true),
  api: z
    .object({
      apiKey: z.string().optional(),
      model: z.string().optional(),
      timeoutMs: z.number().int().min(5_000).max(300_000).default(DEFAULT_TIMEOUT_MS),
    })
    .default({ timeoutMs: DEFAULT_TIMEOUT_MS }),
});
export type Config = z.infer<typeof ConfigSchema>;

export function defaultConfig(): Config {
  return ConfigSchema.parse({});
}

export function configExists(): boolean {
  return existsSync(configPath());
}

export function loadConfig(): Config {
  const p = configPath();
  if (!existsSync(p)) return defaultConfig();
  try {
    const parsed = ConfigSchema.safeParse(JSON.parse(readFileSync(p, 'utf8')));
    return parsed.success ? parsed.data : defaultConfig();
  } catch {
    return defaultConfig();
  }
}

/** Atomic write, file mode 0600 (owner read/write only) on POSIX. */
export function saveConfig(cfg: Config): void {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(ConfigSchema.parse(cfg), null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, p);
  if (process.platform !== 'win32') {
    try {
      chmodSync(p, 0o600);
    } catch {
      /* best effort */
    }
  }
}

export function resolveApiKey(cfg: Config): { key: string; source: 'env' | 'config' } | null {
  const env = process.env.ANTHROPIC_API_KEY?.trim();
  if (env) return { key: env, source: 'env' };
  const stored = cfg.api.apiKey?.trim();
  if (stored) return { key: stored, source: 'config' };
  return null;
}

export function resolveModel(cfg: Config): string {
  return process.env.ANTHROPIC_MODEL?.trim() || cfg.api.model?.trim() || DEFAULT_MODEL;
}

export function resolveTimeout(cfg: Config): number {
  const env = Number(process.env.ENG_AI_TIMEOUT_MS);
  return Number.isFinite(env) && env >= 1000 ? env : cfg.api.timeoutMs;
}

/** For display: never print a key. */
export function maskKey(key: string | undefined): string {
  if (!key) return '—';
  return `•••• (${key.length} chars)`;
}
