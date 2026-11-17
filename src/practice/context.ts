import type { DB } from '../db/index.js';
import type { Store } from '../db/store.js';
import type { Config } from '../config.js';
import type { Locale, UserRow } from '../types.js';

export interface Ctx {
  db: DB;
  store: Store;
  config: Config;
  locale: Locale;
  user: UserRow;
}
