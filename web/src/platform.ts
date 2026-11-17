/**
 * Thin, null-safe wrappers over the claude.ai artifact runtime.
 * Every capability may be missing (browser, signed-out, mobile app):
 * each wrapper degrades to a browser fallback or reports "unavailable".
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const w = window as Any;
const use = (name: string): Promise<Any | null> =>
  w.claude?.use ? (w.claude.use(name) as Promise<Any | null>).catch(() => null) : Promise.resolve(null);

// ── storage (db + localStorage cache) ─────────────────────────
const LS_KEY = 'eng-web-state-v1';

export function readLocal<T>(): T | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function writeLocal(value: unknown): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(value));
  } catch {
    /* private mode / blocked storage */
  }
}

export interface CloudStore {
  load(): Promise<Record<string, unknown> | null>;
  save(value: Record<string, unknown>): Promise<void>;
}

/** The learner's private document: data/users/<id>/progress. Null when db or identity is unavailable. */
export async function cloudStore(): Promise<CloudStore | null> {
  const [db, user] = await Promise.all([use('db'), use('user')]);
  if (!db || !user) return null;
  const id: string | null = await user.id().catch(() => null);
  if (!id) return null;
  const ref = db.doc(`data/users/${id}/progress`);
  let chain: Promise<void> = Promise.resolve();
  return {
    async load() {
      const snap = await ref.get();
      return snap.exists ? (snap.data() as Record<string, unknown>) : null;
    },
    save(value) {
      // One write at a time per document.
      chain = chain.then(() => ref.set(JSON.parse(JSON.stringify(value)))).catch(() => undefined);
      return chain;
    },
  };
}

// ── speech out ────────────────────────────────────────────────
let ttsP: Promise<Any | null> | null = null;
export async function speak(text: string, slow = false): Promise<boolean> {
  ttsP ??= use('tts');
  const tts = await ttsP;
  if (tts) {
    try {
      await tts.speak(text, { language: 'en', rate: slow ? 0.8 : 1 });
      return true;
    } catch (e) {
      if ((e as Any)?.code !== 'not_granted' && (e as Any)?.code !== 'unavailable') return false;
    }
  }
  const synth = w.speechSynthesis as SpeechSynthesis | undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return false;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = slow ? 0.8 : 1;
    const voice = synth.getVoices().find((v) => v.lang.startsWith('en'));
    if (voice) u.voice = voice;
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function canSpeakSync(): boolean {
  return typeof w.speechSynthesis !== 'undefined' || !!w.claude?.use;
}

// ── speech in (dictation) ─────────────────────────────────────
export interface Mic {
  start(onText: (text: string) => void, onState: (listening: boolean) => void): void;
  stop(): void;
}
export async function mic(): Promise<Mic | null> {
  const d = await use('dictation');
  if (!d) return null;
  let finalText = '';
  let unsub: (() => void)[] = [];
  return {
    start(onText, onState) {
      finalText = '';
      unsub.forEach((u) => u());
      unsub = [
        d.onPartial(({ text }: { text: string }) => onText((finalText + ' ' + text).trim())),
        d.onFinal(({ text }: { text: string }) => {
          finalText = (finalText + ' ' + text).trim();
          onText(finalText);
        }),
        d.onState(({ state }: { state: string }) => onState(state === 'listening' || state === 'starting')),
      ];
      // Must be called synchronously from the click.
      d.start({ language: 'en' }).catch(() => onState(false));
    },
    stop() {
      d.stop().catch(() => undefined);
    },
  };
}

// ── Claude (sample) ───────────────────────────────────────────
export type AskResult<T> = { ok: true; data: T } | { ok: false; code: string };
let sampleP: Promise<Any | null> | null = null;
export async function aiAvailable(): Promise<boolean> {
  sampleP ??= use('sample');
  return !!(await sampleP);
}
export async function askJson<T>(
  input: string | { role: 'user' | 'assistant'; content: string }[],
): Promise<AskResult<T>> {
  sampleP ??= use('sample');
  const sample = await sampleP;
  if (!sample) return { ok: false, code: 'unavailable' };
  try {
    return { ok: true, data: (await sample.json(input, { modelTier: 'default', cache: false })) as T };
  } catch (e) {
    return { ok: false, code: String((e as Any)?.code ?? 'upstream_error') };
  }
}
