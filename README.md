# eng — تدريب يومي على الإنجليزية

`eng` is a command-line English trainer you run **once a day for 10–20 minutes**. It follows a CEFR
**A1 → C1** curriculum, schedules vocabulary with **spaced repetition**, keeps an **error notebook**
(دفتر الأخطاء), and trains four skills: vocabulary/grammar, writing, listening (dictation) and speaking.

The interface is **Arabic-first** (Modern Standard, clear and friendly for Egyptian learners). Add
`--lang en` for an English interface. The English learning content is always in English.

It works **fully offline**. An optional Anthropic API key adds free AI conversation, a deeper
writing coach and on-demand explanations.

```bash
npm install -g .     # from this folder (or: npm link)
eng                  # first run: setup wizard → then today's session
```

Requires Node.js ≥ 20. Data lives in `~/.eng/` (`data.db`, `config.json`). Set `ENG_HOME` to use a different folder.

---

## Daily use

| Command               | What it does                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `eng` / `eng today`   | **Today's session**: due reviews → old mistakes → next lesson → dictation → (≥20 min) conversation. Planned to fit your daily minutes. |
| `eng learn [unit]`    | Study the next unit (or e.g. `eng learn b1-02`). `--list` shows every unit and your score.                                             |
| `eng review`          | Spaced-repetition vocabulary review only.                                                                                              |
| `eng dictation`       | Listening & spelling.                                                                                                                  |
| `eng mistakes`        | Your error notebook. `--practice` re-tests them; a correct answer removes the entry.                                                   |
| `eng chat`            | Conversation: AI partner if a key is set, otherwise a scripted dialogue simulation. `--topic`, `--offline`, `--unit`.                  |
| `eng write`           | Writing coach: corrected text, error list, 3 upgrade tips, CEFR estimate. `--task`, `--file`, `--offline`.                             |
| `eng explain <topic>` | Explains a grammar point or a word (English + Arabic), with examples and a mini drill.                                                 |
| `eng progress`        | Level, streak, XP, units, vocabulary, **per-skill accuracy this week vs last week**, 14-day activity. `--json` for scripts.            |
| `eng vocab [word]`    | Your words and their next review dates, or search the word bank.                                                                       |
| `eng placement`       | Adaptive placement test.                                                                                                               |
| `eng config …`        | `show`, `set <key> <value>`, `set-key`, `clear-key`, `path`.                                                                           |
| `eng reset`           | Delete all progress (keeps the curriculum).                                                                                            |

Global flags: `--lang ar|en`, `--no-color`, `--no-tts`. Type **`:q`** at any prompt to stop, save and see your summary. Ctrl+C also saves.

`eng config set` keys: `name`, `level`, `target`, `minutes` (5–120), `locale` (`ar`/`en`), `tts` (`on`/`off`), `model`, `timeout` (ms).

## How learning is measured

- **Units** pass at **80%** (the latest attempt on each exercise counts). Units you haven't passed come back.
- **Promotion** to the next CEFR level happens automatically when every unit at your level is
  passed **and** 60% of that level's words are "known" (≥ 2 successful reviews).
- **Vocabulary** uses SM-2 with four ratings (Again / Hard / Good / Easy). A forgotten card comes
  back after 10 minutes. New cards are recognition + self-rating. Known cards switch to
  _production_ (Arabic → type the English word) and are graded automatically. That production
  step is the harder, more effective one.
- **Grading** ignores case, punctuation and contraction forms (`don't` = `do not`). It accepts
  small typos as "almost": you get partial XP and see the correct spelling. Dictation is graded
  word by word and shows missing, extra and misspelled words.
- **Skill trends** in `eng progress` compare accuracy per skill over the last 7 days against the 7 before.
- **Streaks and XP**: a streak bonus of +5% per day (capped at +50%). Missing a day resets the streak.

## Curriculum

15 units (3 per level), each with grammar points (explained in English and Arabic), 6 words
(with IPA, Arabic translation and an example), a scripted dialogue, all six exercise types
(`mcq`, `gap_fill`, `word_order`, `translate`, `dictation`, `speaking`) and dictation sentences.

| Level | Units                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------- |
| A1    | Greetings (to be) · Daily routine (present simple) · Shopping (some/any, how much/many)                   |
| A2    | Last weekend (past simple) · Plans (going to / will) · Directions (prepositions, imperatives)             |
| B1    | Experiences (present perfect, for/since) · Work (must/have to/should) · Health (1st & 2nd conditionals)   |
| B2    | Technology (passive) · Debate (although/despite/however/whereas) · News (reported speech)                 |
| C1    | Professional communication (hedging) · Emphasis (inversion, clefts) · Nuance (mixed conditionals, idioms) |

The explanations target typical transfer errors from Arabic: the missing verb _be_, `since` + a
duration, the article in "the life is…", `although … but`, "I have 25 years", and others. A test
(`tests/curriculum.test.ts`) checks that every answer, word-order token set, model reply and
dictation item is solvable by the app's own grader.

## Speaking and listening without a microphone

A terminal can't reliably capture audio, so speaking practice works like this. You **say the
answer out loud, then type what you said**. The app checks that your reply covers the key ideas,
shows a model answer, reads it aloud, and asks you to **shadow** it (repeat it twice).

Text-to-speech is detected at runtime and is never required:

- macOS: `say`
- Linux: `espeak-ng` or `espeak` (`sudo apt install espeak-ng`)
- Windows: SAPI through PowerShell

Without TTS, dictation becomes a _cloze dictation_: key words are hidden and you type the full sentence.

## Optional AI features (Anthropic API)

Everything above works without a key. With one:

- `eng chat`: free conversation at your level. Replies come in English, with a correction block
  (your mistakes and better phrasings) in your interface language.
- `eng write`: a corrected version, an explained error list, 3 upgrade tips, and a CEFR band estimate.
- `eng explain`: simple English + Arabic explanation, 3 examples, and a 3-question drill.

**Key setup**: `export ANTHROPIC_API_KEY=sk-ant-…` is the recommended option, especially on shared
machines, because the key is never written to disk. Alternatively, `eng config set-key` stores it
in `~/.eng/config.json` with file mode **0600**. The env var takes priority. The key is never printed.

**Model**: the default is **`claude-sonnet-5-5`** (Claude Sonnet 5.5, the current mid-tier model).
Override it with `ANTHROPIC_MODEL=…` or `eng config set model …`.
_Verification note:_ this ID was checked against Anthropic's model table as bundled with the
Claude API reference used to build this app (dated 2026-11-03). `docs.anthropic.com` could not be
reached from the build environment, so check the [models page](https://docs.anthropic.com/en/docs/about-claude/models)
before relying on it.

**Reliability rules** (in `src/ai/client.ts`):

- **Strict output contract.** Every call requests JSON through `output_config.format` (a JSON
  schema generated from a zod schema). The parsed object is then validated again with zod
  before use. Forced `tool_choice` is not used because current models reject it.
- **Malformed output** (bad JSON, schema mismatch, truncation) is retried **once**. After that it
  becomes a typed failure.
- **Retries.** 429 / 5xx / network errors / timeouts get **at most 2 retries** with exponential
  backoff and jitter. 401/403/400 are not retried. The SDK's own retries are disabled so the
  policy is in one place.
- **Timeout.** 45 s by default per request. Change it with `eng config set timeout 60000` or `ENG_AI_TIMEOUT_MS`.
- **Graceful degradation.** A missing key, network error, rate limit, refusal or bad response
  never crashes the app. It prints a one-line notice and switches to the offline engine (scripted
  dialogue, rule-based writing checker, curriculum search).

Not included: the API's server-side refusal **fallbacks** parameter (beta). A refusal simply
switches to the offline engine.

## Development

```bash
npm install
npm run build        # tsc → dist/
npm test             # vitest: SRS, grading, levels/placement, streaks, writing checker, DB, AI client, config, content integrity
npm run lint         # eslint (flat config)
npm run format       # prettier
node dist/cli.js --lang en
```

```
migrations/            numbered SQL migrations, tracked in schema_migrations (run on every start)
src/cli.ts             commander entry point (bin: eng)
src/config.ts paths.ts config.json (zod-validated, 0600), ENG_HOME
src/db/                openDb (WAL, foreign keys, migrations, idempotent seeding) · Store (all SQL, prepared statements)
src/engine/            pure logic: srs.ts · grading.ts · level.ts · streak.ts · writing.ts
src/content/           curriculum.ts (A1→C1) · tasks.ts (writing prompts)
src/practice/          exercise runner, review cards, lessons, dialogue simulation, session bookkeeping
src/ai/                client.ts (timeout/retry/validation) · schemas.ts (zod contracts) · coach.ts (prompts)
src/commands/          one module per command
src/i18n/              en.ts (canonical keys) · ar.ts (type-checked against en)
src/ui/ tts.ts         chalk/boxen/cli-table3 output, @inquirer prompts, optional OS TTS
tests/                 vitest
```

## Assumptions and decisions

- **The spec was cut off** after "Core engine modules (source of truth for the file layout)". The layout above is my own choice.
- Curriculum content uses stable string IDs (`a1-01`, `a1-01-e3`, `a1-01-v-hello`). Re-seeding
  after a content update keeps all attempts and reviews. Seeding is skipped when the content hash
  is unchanged.
- The API key lives in `config.json`, as the spec requires. The `settings` table holds internal
  state only: curriculum hash, which unit intros were shown, placement date.
- `users.level` is the source of truth for the current level (changed by placement and promotion).
  Name, target, minutes and locale are written to both `config.json` and `users`, and `eng config set` keeps them in sync.
- Placement answers are not stored as attempts, so they don't count toward unit progress.
- Offline CEFR estimates for writing come from a heuristic (sentence length, vocabulary range,
  linkers, error density) and are labelled as rough.
- Colour is off when stdout is not a TTY, when `NO_COLOR` is set, or with `--no-color`.
- Interactive commands need a TTY. `progress`, `vocab` and `config` also work in scripts.

## License

MIT
