import { statSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL,
  defaultConfig,
  loadConfig,
  maskKey,
  resolveApiKey,
  resolveModel,
  saveConfig,
} from '../src/config.js';
import { applyConfigValue } from '../src/commands/config.js';
import { configPath } from '../src/paths.js';
import { tempHome } from './helpers.js';

describe('config', () => {
  it('saves with mode 0600 and round-trips', () => {
    tempHome();
    saveConfig({ ...defaultConfig(), name: 'Mona', api: { apiKey: 'sk-ant-secret', timeoutMs: 45_000 } });
    if (process.platform !== 'win32') expect(statSync(configPath()).mode & 0o777).toBe(0o600);
    expect(loadConfig().name).toBe('Mona');
    expect(readFileSync(configPath(), 'utf8')).toContain('"name": "Mona"');
  });

  it('falls back to defaults on a corrupt file', () => {
    tempHome();
    saveConfig(defaultConfig());
    writeFileSync(configPath(), '{not json');
    expect(loadConfig()).toEqual(defaultConfig());
  });

  it('env key wins over stored key, and keys are never shown', () => {
    const cfg = { ...defaultConfig(), api: { apiKey: 'sk-ant-stored', timeoutMs: 45_000 } };
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env';
    expect(resolveApiKey(cfg)).toEqual({ key: 'sk-ant-env', source: 'env' });
    delete process.env.ANTHROPIC_API_KEY;
    expect(resolveApiKey(cfg)?.source).toBe('config');
    expect(maskKey('sk-ant-stored')).not.toContain('stored');
  });

  it('default model is the documented mid-tier id', () => {
    delete process.env.ANTHROPIC_MODEL;
    expect(resolveModel(defaultConfig())).toBe(DEFAULT_MODEL);
  });

  it('validates `config set` values', () => {
    const cfg = defaultConfig();
    expect(applyConfigValue(cfg, 'minutes', '20').cfg.dailyMinutes).toBe(20);
    expect(applyConfigValue(cfg, 'target', 'c1').userPatch).toEqual({ target_level: 'C1' });
    expect(() => applyConfigValue(cfg, 'minutes', '2')).toThrow();
    expect(() => applyConfigValue(cfg, 'locale', 'fr')).toThrow();
    expect(() => applyConfigValue(cfg, 'nope', 'x')).toThrow();
  });
});
