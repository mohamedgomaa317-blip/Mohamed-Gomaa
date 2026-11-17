import { LEVELS, type Level, type Locale, type UserRow } from '../types.js';
import type { Store } from '../db/store.js';
import { saveConfig, type Config } from '../config.js';
import { ask, choose } from '../ui/ask.js';
import { box, c, print } from '../ui/out.js';
import { setLocale, t } from '../i18n/index.js';
import { levelIndex } from '../engine/level.js';
import { runPlacement } from './placement.js';

/** First-run wizard. Writes both config.json and the single `users` row. */
export async function runInit(store: Store, config: Config, locale: Locale): Promise<UserRow> {
  box(c.bold(t('init.welcome')), 'eng', 'magenta');

  const chosenLocale = await choose<Locale>(t('init.locale'), [
    { name: 'العربية', value: 'ar' },
    { name: 'English', value: 'en' },
  ]);
  if (chosenLocale !== locale) setLocale(chosenLocale);

  const name = await ask(t('init.name'), { default: config.name !== 'Learner' ? config.name : undefined });
  const how = await choose(t('init.levelHow'), [
    { name: t('init.levelPlacement'), value: 'placement' },
    { name: t('init.levelKnown'), value: 'known' },
    { name: t('init.levelBeginner'), value: 'beginner' },
  ]);

  let level: Level = 'A1';
  if (how === 'known') {
    level = await choose<Level>(
      t('init.level'),
      LEVELS.map((l) => ({ name: t(`level.${l}`), value: l })),
    );
  } else if (how === 'placement') {
    level = await runPlacement(store);
  }

  const targets = LEVELS.filter((l) => levelIndex(l) >= levelIndex(level));
  const target = await choose<Level>(
    t('init.target'),
    targets.map((l) => ({ name: t(`level.${l}`), value: l })),
  );
  const minutes = await choose<number>(
    t('init.minutes'),
    [10, 15, 20, 30].map((m) => ({ name: `${m}`, value: m })),
  );

  const next: Config = { ...config, name, locale: chosenLocale, targetLevel: target, dailyMinutes: minutes };
  saveConfig(next);
  store.upsertUser({ name, level, target_level: target, daily_minutes: minutes, locale: chosenLocale });
  if (how === 'placement') store.setSetting('placement_done', new Date().toISOString());
  print('', c.green.bold(t('init.done', { name })), c.dim(t('prompt.quitHint')));
  return store.getUser()!;
}
