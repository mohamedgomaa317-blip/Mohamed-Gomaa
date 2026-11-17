import { password } from '@inquirer/prompts';
import type { Store } from '../db/store.js';
import {
  loadConfig,
  maskKey,
  resolveApiKey,
  resolveModel,
  resolveTimeout,
  saveConfig,
  type Config,
} from '../config.js';
import { parseLevel } from '../engine/level.js';
import { configPath, dbPath } from '../paths.js';
import { bad, box, c, ok, print, warn } from '../ui/out.js';
import { t } from '../i18n/index.js';
import { detectTts } from '../tts.js';

export const CONFIG_KEYS = ['name', 'level', 'target', 'minutes', 'locale', 'tts', 'model', 'timeout'] as const;
type ConfigKey = (typeof CONFIG_KEYS)[number];

export function showConfig(store: Store | null): void {
  const cfg = loadConfig();
  const key = resolveApiKey(cfg);
  const user = store?.getUser();
  const status = key
    ? t('config.aiOn', { source: key.source === 'env' ? 'ANTHROPIC_API_KEY' : 'config.json', model: resolveModel(cfg) })
    : t('config.aiOff');
  box(
    [
      `name:      ${cfg.name}`,
      `level:     ${user?.level ?? '—'}`,
      `target:    ${cfg.targetLevel}`,
      `minutes:   ${cfg.dailyMinutes}`,
      `locale:    ${cfg.locale}`,
      `tts:       ${cfg.tts ? 'on' : 'off'} (${detectTts()?.name ?? 'none found'})`,
      `model:     ${resolveModel(cfg)}`,
      `timeout:   ${resolveTimeout(cfg)} ms`,
      `api key:   ${maskKey(key?.key)}`,
      '',
      c.bold(t('config.aiStatus', { status })),
      c.dim(`config: ${configPath()}`),
      c.dim(`data:   ${dbPath()}`),
    ].join('\n'),
    t('config.title'),
  );
}

/** Validates and applies `eng config set <key> <value>`. Pure w.r.t. I/O except saving. */
export function applyConfigValue(
  cfg: Config,
  key: string,
  raw: string,
): { cfg: Config; userPatch: Record<string, unknown> } {
  const k = key as ConfigKey;
  const v = raw.trim();
  const fail = (): never => {
    throw new Error(t('config.badValue', { key, value: raw }));
  };
  switch (k) {
    case 'name':
      if (!v || v.length > 60) fail();
      return { cfg: { ...cfg, name: v }, userPatch: { name: v } };
    case 'level':
      return { cfg, userPatch: { level: parseLevel(v) } };
    case 'target': {
      const lvl = parseLevel(v);
      return { cfg: { ...cfg, targetLevel: lvl }, userPatch: { target_level: lvl } };
    }
    case 'minutes': {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 5 || n > 120) fail();
      return { cfg: { ...cfg, dailyMinutes: n }, userPatch: { daily_minutes: n } };
    }
    case 'locale':
      if (v !== 'ar' && v !== 'en') fail();
      return { cfg: { ...cfg, locale: v as 'ar' | 'en' }, userPatch: { locale: v } };
    case 'tts':
      if (!['on', 'off', 'true', 'false'].includes(v)) fail();
      return { cfg: { ...cfg, tts: v === 'on' || v === 'true' }, userPatch: {} };
    case 'model':
      if (!/^[a-z0-9][a-z0-9.\-@:]{2,80}$/i.test(v)) fail();
      return { cfg: { ...cfg, api: { ...cfg.api, model: v } }, userPatch: {} };
    case 'timeout': {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 5_000 || n > 300_000) fail();
      return { cfg: { ...cfg, api: { ...cfg.api, timeoutMs: n } }, userPatch: {} };
    }
    default:
      throw new Error(t('config.unknownKey', { key, keys: CONFIG_KEYS.join(', ') }));
  }
}

export function setConfig(store: Store | null, key: string, value: string): void {
  try {
    const { cfg, userPatch } = applyConfigValue(loadConfig(), key, value);
    saveConfig(cfg);
    if (store?.getUser() && Object.keys(userPatch).length) store.updateUserFields(userPatch);
    ok(t('config.saved', { key, value }));
  } catch (err) {
    bad(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export async function setKey(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY) warn(t('config.keyEnv'));
  const key = (await password({ message: t('config.keyPrompt'), mask: '•' })).trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) {
    bad(t('config.keyInvalid'));
    process.exitCode = 1;
    return;
  }
  const cfg = loadConfig();
  saveConfig({ ...cfg, api: { ...cfg.api, apiKey: key } });
  ok(t('config.keySaved', { path: configPath() }));
  warn(t('config.keyWarn'));
}

export function clearKey(): void {
  const cfg = loadConfig();
  const { apiKey: _drop, ...rest } = cfg.api;
  saveConfig({ ...cfg, api: rest });
  ok(t('config.keyCleared'));
  if (process.env.ANTHROPIC_API_KEY) print(c.dim(t('config.keyEnv')));
}
