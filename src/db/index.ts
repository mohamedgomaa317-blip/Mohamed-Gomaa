import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CURRICULUM, CURRICULUM_VERSION } from '../content/curriculum.js';
import { dbPath, migrationsDir } from '../paths.js';
import type { UnitSeed } from '../types.js';

export type DB = Database.Database;

export function openDb(file: string = dbPath(), opts: { seed?: boolean } = {}): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 3000');
  migrate(db);
  if (opts.seed !== false) seed(db);
  return db;
}

/** Runs every `NNN_name.sql` in `migrations/` not yet recorded in `schema_migrations`, in order. */
export function migrate(db: DB, dir: string = migrationsDir()): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  );
  const files = readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const ran: string[] = [];
  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
  for (const f of files) {
    const version = parseInt(f, 10);
    if (applied.has(version)) continue;
    const sql = readFileSync(join(dir, f), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(version, f, new Date().toISOString());
    })();
    ran.push(f);
  }
  return ran;
}

export function curriculumHash(units: UnitSeed[] = CURRICULUM): string {
  return createHash('sha256').update(JSON.stringify(units)).digest('hex').slice(0, 16);
}

/**
 * Upserts the built-in curriculum. Idempotent and cheap: skipped when the stored
 * content hash matches. Uses stable string ids, so learner history is preserved.
 */
export function seed(db: DB, units: UnitSeed[] = CURRICULUM): boolean {
  const hash = `${CURRICULUM_VERSION}:${curriculumHash(units)}`;
  const current = db.prepare("SELECT value FROM settings WHERE key = 'curriculum_hash'").get() as
    { value: string } | undefined;
  if (current?.value === hash) return false;

  const upUnit = db.prepare(`INSERT INTO units (id, level, order_index, title, theme, estimated_minutes,
      grammar_points_json, vocab_json, dialogue_json, exercise_ids_json)
    VALUES (@id, @level, @order_index, @title, @theme, @estimated_minutes, @grammar, @vocab, @dialogue, @exercises)
    ON CONFLICT(id) DO UPDATE SET level=excluded.level, order_index=excluded.order_index, title=excluded.title,
      theme=excluded.theme, estimated_minutes=excluded.estimated_minutes, grammar_points_json=excluded.grammar_points_json,
      vocab_json=excluded.vocab_json, dialogue_json=excluded.dialogue_json, exercise_ids_json=excluded.exercise_ids_json`);
  const upEx =
    db.prepare(`INSERT INTO exercises (id, level, unit_id, type, prompt, options_json, answer, explanation, points)
    VALUES (@id, @level, @unit_id, @type, @prompt, @options_json, @answer, @explanation, @points)
    ON CONFLICT(id) DO UPDATE SET level=excluded.level, unit_id=excluded.unit_id, type=excluded.type,
      prompt=excluded.prompt, options_json=excluded.options_json, answer=excluded.answer,
      explanation=excluded.explanation, points=excluded.points`);
  const upVocab = db.prepare(`INSERT INTO vocab (id, level, word, ipa, translation, example, tags_json)
    VALUES (@id, @level, @word, @ipa, @translation, @example, @tags_json)
    ON CONFLICT(id) DO UPDATE SET level=excluded.level, word=excluded.word, ipa=excluded.ipa,
      translation=excluded.translation, example=excluded.example, tags_json=excluded.tags_json`);
  const upWords = db.prepare(`INSERT INTO words (id, level, unit_id, sentence, hidden_words_json)
    VALUES (@id, @level, @unit_id, @sentence, @hidden)
    ON CONFLICT(id) DO UPDATE SET level=excluded.level, unit_id=excluded.unit_id, sentence=excluded.sentence,
      hidden_words_json=excluded.hidden_words_json`);

  db.transaction(() => {
    for (const u of units) {
      upUnit.run({
        id: u.id,
        level: u.level,
        order_index: u.order,
        title: u.title,
        theme: u.theme,
        estimated_minutes: u.minutes,
        grammar: JSON.stringify(u.grammar),
        vocab: JSON.stringify(u.vocab.map((v) => v.id)),
        dialogue: JSON.stringify(u.dialogue),
        exercises: JSON.stringify(u.exercises.map((e) => e.id)),
      });
      for (const e of u.exercises) {
        upEx.run({
          id: e.id,
          level: u.level,
          unit_id: u.id,
          type: e.type,
          prompt: e.prompt,
          options_json: e.options ? JSON.stringify(e.options) : null,
          answer: e.answer,
          explanation: e.explanation,
          points: e.points ?? 10,
        });
      }
      for (const v of u.vocab) {
        upVocab.run({ ...v, level: u.level, tags_json: JSON.stringify(v.tags) });
      }
      for (const d of u.dictation) {
        upWords.run({
          id: d.id,
          level: u.level,
          unit_id: u.id,
          sentence: d.sentence,
          hidden: JSON.stringify(d.hidden),
        });
      }
    }
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('curriculum_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(hash);
  })();
  return true;
}
