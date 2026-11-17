#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command, Option } from 'commander';
import { configExists, loadConfig } from './config.js';
import { openDb, type DB } from './db/index.js';
import { Store } from './db/store.js';
import { getLocale, resolveLocale, setLocale, t } from './i18n/index.js';
import { packageRoot } from './paths.js';
import type { Ctx } from './practice/context.js';
import { setTtsEnabled } from './tts.js';
import { isPromptExit, QuitSession, yesNo } from './ui/ask.js';
import { bad, c, ok, print, setColor, warn } from './ui/out.js';
import { runInit } from './commands/init.js';
import { placementCommand } from './commands/placement.js';
import { todayCommand } from './commands/today.js';
import { dictationCommand, learnCommand, mistakesCommand, reviewCommand } from './commands/practice.js';
import { chatCommand } from './commands/chat.js';
import { writeCommand } from './commands/write.js';
import { explainCommand } from './commands/explain.js';
import { progressCommand, vocabCommand } from './commands/progress.js';
import { clearKey, CONFIG_KEYS, setConfig, setKey, showConfig } from './commands/config.js';
import { configPath, dbPath } from './paths.js';

const argv = process.argv;

// The interface language must be known before help text is built, so read --lang early.
function earlyLang(args: string[]): string | undefined {
  const i = args.findIndex((a) => a === '--lang' || a.startsWith('--lang='));
  if (i < 0) return undefined;
  const a = args[i]!;
  return a.includes('=') ? a.split('=')[1] : args[i + 1];
}
const langFlag = earlyLang(argv);
setLocale(resolveLocale(langFlag, configExists() ? loadConfig().locale : undefined));
if (argv.includes('--no-color')) setColor(false);

/** Help text in the active interface language. */
const d = (ar: string, en: string): string => (getLocale() === 'ar' ? ar : en);

function version(): string {
  try {
    return (JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
}

interface RunOpts {
  /** Requires a learner profile; runs the setup wizard on first use. */
  needsUser?: boolean;
}

async function withCtx(fn: (ctx: Ctx) => Promise<void> | void, opts: RunOpts = { needsUser: true }): Promise<void> {
  const global = program.opts<{ tts: boolean; lang?: string }>();
  let config = loadConfig();
  setTtsEnabled(config.tts && global.tts !== false);
  let db: DB | null = null;
  try {
    db = openDb();
    const store = new Store(db);
    let user = store.getUser();
    if (!user && opts.needsUser) {
      if (!process.stdin.isTTY) {
        bad(t('app.needTty'));
        process.exitCode = 1;
        return;
      }
      user = await runInit(store, config, getLocale());
      config = loadConfig();
    }
    if (user && !global.lang) setLocale(user.locale);
    await fn({ db, store, config, locale: getLocale(), user: user! });
  } finally {
    db?.close();
  }
}

const program = new Command();

program
  .name('eng')
  .description(t('app.description'))
  .version(version(), '-v, --version')
  .addOption(new Option('--lang <lang>', d('لغة الواجهة', 'interface language')).choices(['ar', 'en']))
  .option('--no-color', d('بدون ألوان', 'disable colours'))
  .option('--no-tts', d('بدون نطق صوتي', 'disable text-to-speech'))
  .showHelpAfterError()
  .action(() => withCtx(todayCommand));

program
  .command('today')
  .description(
    d('جلسة اليوم: مراجعة + درس + إملاء (الأمر الافتراضي)', "today's session: review + lesson + dictation (default)"),
  )
  .action(() => withCtx(todayCommand));

program
  .command('init')
  .description(d('إعداد الملف الشخصي (الاسم، المستوى، الهدف)', 'set up your profile (name, level, goal)'))
  .option('-f, --force', d('إعادة الإعداد', 're-run setup'))
  .action((o: { force?: boolean }) =>
    withCtx(
      async ({ store, config }) => {
        if (store.getUser() && !o.force) {
          print(t('init.already'));
          return;
        }
        await runInit(store, config, getLocale());
      },
      { needsUser: false },
    ),
  );

program
  .command('placement')
  .description(d('اختبار تحديد المستوى', 'adaptive placement test'))
  .action(() => withCtx(placementCommand));

program
  .command('review')
  .description(d('مراجعة الكلمات المستحقة (التكرار المتباعد)', 'review due words (spaced repetition)'))
  .option('-n, --limit <n>', d('أقصى عدد', 'max cards'), (v) => parseInt(v, 10))
  .action((o: { limit?: number }) => withCtx((ctx) => reviewCommand(ctx, o)));

program
  .command('learn')
  .description(d('ادرس الوحدة التالية أو وحدة محددة', 'study the next unit or a given one'))
  .argument('[unit]', d('معرّف الوحدة مثل a2-01', 'unit id, e.g. a2-01'))
  .option('-l, --list', d('اعرض كل الوحدات', 'list all units'))
  .option('--level <level>', d('اختر وحدة من مستوى', 'pick a unit from a level'))
  .action((unit: string | undefined, o: { list?: boolean; level?: string }) =>
    withCtx((ctx) => learnCommand(ctx, unit, o)),
  );

program
  .command('dictation')
  .description(d('تمرين استماع وإملاء', 'listening & spelling practice'))
  .option('-n, --count <n>', d('عدد الجمل', 'number of sentences'), (v) => parseInt(v, 10))
  .option('--level <level>', d('المستوى', 'level'))
  .action((o: { count?: number; level?: string }) => withCtx((ctx) => dictationCommand(ctx, o)));

program
  .command('mistakes')
  .description(d('دفتر الأخطاء', 'error notebook'))
  .option('-p, --practice', d('أعد حل الأخطاء', 'practise your mistakes'))
  .option('--clear', d('اعتبر كل الأخطاء محلولة', 'resolve all'))
  .action((o: { practice?: boolean; clear?: boolean }) => withCtx((ctx) => mistakesCommand(ctx, o)));

program
  .command('chat')
  .description(
    d('محادثة بالإنجليزية (ذكاء اصطناعي أو محاكاة دون اتصال)', 'English conversation (AI, or offline simulation)'),
  )
  .option('-t, --topic <topic>', d('موضوع المحادثة', 'conversation topic'))
  .option('--unit <id>', d('حوار وحدة محددة (دون اتصال)', 'dialogue of a given unit (offline)'))
  .option('--offline', d('بدون ذكاء اصطناعي', 'do not use AI'))
  .action((o: { topic?: string; unit?: string; offline?: boolean }) => withCtx((ctx) => chatCommand(ctx, o)));

program
  .command('write')
  .description(d('مدرّب الكتابة: تصحيح ونصائح ومستوى تقديري', 'writing coach: corrections, tips, CEFR estimate'))
  .option('-t, --task <task>', d('موضوع الكتابة', 'writing task'))
  .option('-f, --file <path>', d('اقرأ النص من ملف', 'read text from a file'))
  .option('--offline', d('بدون ذكاء اصطناعي', 'do not use AI'))
  .action((o: { task?: string; file?: string; offline?: boolean }) => withCtx((ctx) => writeCommand(ctx, o)));

program
  .command('explain')
  .description(d('اشرح قاعدة أو كلمة مع أمثلة وتدريب', 'explain a grammar point or word, with examples and a drill'))
  .argument('[topic...]', d('القاعدة أو الكلمة', 'grammar point or word'))
  .option('--offline', d('بدون ذكاء اصطناعي', 'do not use AI'))
  .action((topic: string[], o: { offline?: boolean }) => withCtx((ctx) => explainCommand(ctx, topic, o)));

program
  .command('progress')
  .alias('stats')
  .description(d('تقدّمك: المستوى، السلسلة، المهارات، المفردات', 'your progress: level, streak, skills, vocabulary'))
  .option('--json', d('إخراج JSON', 'JSON output'))
  .action((o: { json?: boolean }) => withCtx((ctx) => progressCommand(ctx, o)));

program
  .command('vocab')
  .description(d('كلماتك ومواعيد مراجعتها، أو ابحث عن كلمة', 'your words and review dates, or search'))
  .argument('[query]', d('كلمة للبحث', 'search term'))
  .action((q: string | undefined) => withCtx((ctx) => vocabCommand(ctx, q), { needsUser: false }));

const config = program.command('config').description(d('الإعدادات ومفتاح API', 'settings and API key'));
config
  .command('show', { isDefault: true })
  .description(d('اعرض الإعدادات', 'show settings'))
  .action(() => withCtx(({ store }) => showConfig(store), { needsUser: false }));
config
  .command('set')
  .description(d(`غيّر إعدادًا: ${CONFIG_KEYS.join(', ')}`, `change a setting: ${CONFIG_KEYS.join(', ')}`))
  .argument('<key>')
  .argument('<value>')
  .action((key: string, value: string) => withCtx(({ store }) => setConfig(store, key, value), { needsUser: false }));
config
  .command('set-key')
  .description(d('احفظ مفتاح Anthropic API (صلاحيات 0600)', 'store an Anthropic API key (mode 0600)'))
  .action(() => setKey());
config
  .command('clear-key')
  .description(d('احذف مفتاح API المحفوظ', 'remove the stored API key'))
  .action(() => clearKey());
config
  .command('path')
  .description(d('مسارات الملفات', 'file locations'))
  .action(() => print(configPath(), dbPath()));

program
  .command('reset')
  .description(d('احذف كل التقدم', 'delete all progress'))
  .option('-y, --yes', d('بدون تأكيد', 'skip confirmation'))
  .action((o: { yes?: boolean }) =>
    withCtx(
      async ({ store }) => {
        if (o.yes || (await yesNo(t('reset.confirm'), false))) {
          store.resetProgress();
          ok(t('reset.done'));
        }
      },
      { needsUser: false },
    ),
  );

async function main(): Promise<void> {
  try {
    await program.parseAsync(argv);
  } catch (err) {
    if (isPromptExit(err) || err instanceof QuitSession) {
      print('', c.dim(t('app.bye')));
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOSPC|SQLITE_FULL/.test(msg)) warn('Disk full.');
    bad(t('app.error', { msg }));
    if (process.env.ENG_DEBUG && err instanceof Error) print(err.stack ?? '');
    process.exitCode = 1;
  }
}

void main();
