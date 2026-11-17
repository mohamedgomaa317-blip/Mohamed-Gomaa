import { readFileSync } from 'node:fs';
import type { Ctx } from '../practice/context.js';
import { withSession } from '../practice/session.js';
import { getAiClient } from '../ai/client.js';
import { reviewWriting } from '../ai/coach.js';
import type { WritingFeedback } from '../ai/schemas.js';
import { checkWriting, pick, type WritingReport } from '../engine/writing.js';
import { WRITING_TASKS } from '../content/tasks.js';
import { ask, choose } from '../ui/ask.js';
import { box, c, dim, heading, notice, print, warn } from '../ui/out.js';
import { t, type MessageKey } from '../i18n/index.js';

async function readMultiline(): Promise<string> {
  print(dim(t('write.enterText')));
  const lines: string[] = [];
  for (;;) {
    const line = await ask(t('write.line'), { allowEmpty: true });
    if (line === '') {
      if (lines.length) break;
      continue;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export async function writeCommand(ctx: Ctx, opts: { task?: string; file?: string; offline?: boolean }): Promise<void> {
  heading(t('write.title'));
  let task = opts.task;
  let text: string;
  if (opts.file) {
    text = readFileSync(opts.file, 'utf8');
  } else {
    if (!task) {
      const own = '__own__';
      task = await choose(t('write.chooseTask'), [
        ...WRITING_TASKS[ctx.user.level].map((x) => ({ name: x, value: x })),
        { name: t('write.ownTopic'), value: own },
      ]);
      if (task === own) task = await ask(t('write.ownTopicPrompt'));
    }
    print(c.bold(t('write.task', { task })));
    text = await readMultiline();
  }
  if (!/\p{L}{2,}.*\s+\p{L}{2,}/su.test(text)) {
    warn(t('write.tooShort'));
    return;
  }

  await withSession(ctx, 'write', async (s) => {
    const ai = opts.offline ? null : getAiClient(ctx.config);
    if (ai) {
      print(dim(t('ai.thinking')));
      const res = await reviewWriting(ai, ctx.user.level, ctx.locale, text, task);
      if (res.ok) {
        printAiFeedback(res.data);
        s.record(res.data.errors.length <= 2, 15);
        return;
      }
      notice(t(`ai.notice.${res.reason}` as MessageKey));
    } else if (!opts.offline) {
      notice(t('ai.notice.no_key'));
    }
    const report = checkWriting(text);
    printOfflineReport(ctx, report);
    s.record(report.issues.length <= 2, 10);
  });
}

function printAiFeedback(f: WritingFeedback): void {
  box(f.corrected, t('write.corrected'), 'green');
  if (f.errors.length) {
    box(
      f.errors
        .slice(0, 12)
        .map(
          (e) =>
            `${c.red.strikethrough(e.original)} → ${c.green(e.correction)}  ${dim(`[${e.category}]`)}\n  ${e.explanation}`,
        )
        .join('\n'),
      t('write.errors'),
      'red',
    );
  }
  box(
    f.tips
      .slice(0, 3)
      .map((x, i) => `${i + 1}. ${x}`)
      .join('\n'),
    t('write.tips'),
    'cyan',
  );
  print('', c.bold(t('write.cefr', { cefr: f.cefr })), dim(f.summary));
}

function printOfflineReport(ctx: Ctx, r: WritingReport): void {
  print(dim(t('write.offlineNote')));
  box(r.corrected, t('write.corrected'), 'green');
  if (r.issues.length) {
    box(
      r.issues
        .slice(0, 15)
        .map(
          (e) =>
            `${c.red(e.original)} → ${c.green(e.correction)}  ${dim(`[${e.category}]`)}\n  ${pick(ctx.locale, e.explanation)}`,
        )
        .join('\n'),
      t('write.errors'),
      'red',
    );
  } else {
    print(c.green(t('write.noErrors')));
  }
  box(r.tips.map((x, i) => `${i + 1}. ${pick(ctx.locale, x)}`).join('\n'), t('write.tips'), 'cyan');
  print(
    '',
    dim(
      t('write.stats', {
        words: r.stats.words,
        sentences: r.stats.sentences,
        avg: r.stats.avgSentenceLength,
        linkers: r.stats.linkers.join(', ') || '—',
      }),
    ),
    c.bold(t('write.cefrOffline', { cefr: r.cefr })),
  );
}
