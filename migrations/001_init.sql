-- 001: initial schema
CREATE TABLE users (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  name              TEXT    NOT NULL,
  level             TEXT    NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1')),
  target_level      TEXT    NOT NULL CHECK (target_level IN ('A1','A2','B1','B2','C1')),
  daily_minutes     INTEGER NOT NULL DEFAULT 15,
  created_at        TEXT    NOT NULL,
  locale            TEXT    NOT NULL DEFAULT 'ar',
  streak_count      INTEGER NOT NULL DEFAULT 0,
  longest_streak    INTEGER NOT NULL DEFAULT 0,
  xp                INTEGER NOT NULL DEFAULT 0,
  last_session_date TEXT
);

CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT    NOT NULL,
  finished_at TEXT,
  mode        TEXT    NOT NULL,
  xp_earned   INTEGER NOT NULL DEFAULT 0,
  accuracy    REAL,
  items_done  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE units (
  id                  TEXT    PRIMARY KEY,
  level               TEXT    NOT NULL,
  order_index         INTEGER NOT NULL,
  title               TEXT    NOT NULL,
  theme               TEXT    NOT NULL,
  estimated_minutes   INTEGER NOT NULL,
  grammar_points_json TEXT    NOT NULL,
  vocab_json          TEXT    NOT NULL,
  dialogue_json       TEXT    NOT NULL,
  exercise_ids_json   TEXT    NOT NULL
);

CREATE TABLE exercises (
  id           TEXT    PRIMARY KEY,
  level        TEXT    NOT NULL,
  unit_id      TEXT    NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  type         TEXT    NOT NULL CHECK (type IN ('mcq','gap_fill','word_order','translate','dictation','speaking')),
  prompt       TEXT    NOT NULL,
  options_json TEXT,
  answer       TEXT    NOT NULL,
  explanation  TEXT    NOT NULL DEFAULT '',
  points       INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE vocab (
  id          TEXT PRIMARY KEY,
  level       TEXT NOT NULL,
  word        TEXT NOT NULL,
  ipa         TEXT NOT NULL DEFAULT '',
  translation TEXT NOT NULL,
  example     TEXT NOT NULL DEFAULT '',
  tags_json   TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE reviews (
  vocab_id      TEXT    PRIMARY KEY REFERENCES vocab(id) ON DELETE CASCADE,
  due_at        TEXT    NOT NULL,
  interval_days REAL    NOT NULL DEFAULT 0,
  ease_factor   REAL    NOT NULL DEFAULT 2.5,
  repetitions   INTEGER NOT NULL DEFAULT 0,
  lapses        INTEGER NOT NULL DEFAULT 0,
  last_rating   INTEGER
);

CREATE TABLE attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id  TEXT    NOT NULL,
  unit_id      TEXT,
  level        TEXT    NOT NULL,
  correct      INTEGER NOT NULL CHECK (correct IN (0,1)),
  answer_given TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL,
  time_ms      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE mistakes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id    TEXT,
  question       TEXT NOT NULL,
  given_answer   TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  explanation    TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  resolved_at    TEXT
);

CREATE TABLE words (
  id                TEXT PRIMARY KEY,
  level             TEXT NOT NULL,
  unit_id           TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  sentence          TEXT NOT NULL,
  hidden_words_json TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
