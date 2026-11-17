import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db/index.js';
import { Store } from '../src/db/store.js';

export function memStore(): Store {
  return new Store(openDb(':memory:'));
}

export function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eng-test-'));
  process.env.ENG_HOME = dir;
  return dir;
}
