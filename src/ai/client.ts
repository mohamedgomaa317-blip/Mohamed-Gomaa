import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { loadConfig, resolveApiKey, resolveModel, resolveTimeout, type Config } from '../config.js';

export type AiFailure =
  | 'no_key'
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'server'
  | 'bad_request'
  | 'invalid_response'
  | 'refusal'
  | 'unknown';

export type AiResult<T> = { ok: true; data: T } | { ok: false; reason: AiFailure; detail?: string };

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface StructuredRequest<S extends z.ZodType> {
  system: string;
  messages: ChatTurn[];
  schema: S;
  maxTokens?: number;
}

/** What a transport returns: the stop reason and the raw text of the response. */
export interface RawResponse {
  stopReason: string | null;
  text: string;
}

export type SendFn = (
  req: { model: string; system: string; messages: ChatTurn[]; schema: z.ZodType; maxTokens: number },
  timeoutMs: number,
) => Promise<RawResponse>;

export interface AiClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Max retries for 429 / 5xx / network errors (spec: 2). */
  maxRetries?: number;
  /** Base backoff in ms; doubled each attempt, plus jitter. */
  backoffMs?: number;
  send?: SendFn;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE: ReadonlySet<AiFailure> = new Set(['rate_limit', 'server', 'network', 'timeout']);

/** Map any thrown error to a failure category, without depending on exact SDK class identity. */
export function classifyError(err: unknown): AiFailure {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (err instanceof Anthropic.APIConnectionError) return 'network';
  const e = err as { status?: unknown; name?: unknown; code?: unknown } | null;
  if (e && typeof e === 'object') {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return 'timeout';
    const status = typeof e.status === 'number' ? e.status : undefined;
    if (status !== undefined) {
      if (status === 401 || status === 403) return 'auth';
      if (status === 408) return 'timeout';
      if (status === 429) return 'rate_limit';
      if (status >= 500) return 'server';
      if (status >= 400) return 'bad_request';
    }
    if (typeof e.code === 'string' && /^(ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE)/.test(e.code)) return 'network';
  }
  return 'unknown';
}

/** Default transport: the official SDK with JSON-schema output (`output_config.format`). */
export function sdkSend(apiKey: string): SendFn {
  // SDK-level retries are disabled: retry policy lives in AiClient so it is testable and bounded.
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  return async (req, timeoutMs) => {
    const resp = await client.messages.create(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages,
        output_config: { format: zodOutputFormat(req.schema) },
      },
      { timeout: timeoutMs, signal: AbortSignal.timeout(timeoutMs + 2_000) },
    );
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return { stopReason: resp.stop_reason, text };
  };
}

export class AiClient {
  private readonly send: SendFn;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly backoffMs: number;

  constructor(private readonly opts: AiClientOptions) {
    this.send = opts.send ?? sdkSend(opts.apiKey);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = opts.maxRetries ?? 2;
    this.backoffMs = opts.backoffMs ?? 1_000;
  }

  get model(): string {
    return this.opts.model;
  }

  /**
   * One structured call with the full safety net:
   *  - transport errors: up to `maxRetries` retries with exponential backoff (429 / 5xx / network / timeout only);
   *  - malformed output (bad JSON, schema mismatch, truncated): one extra attempt, then a typed failure.
   * Never throws.
   */
  async structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<AiResult<z.infer<S>>> {
    let validationRetries = 1;
    let transportRetries = this.maxRetries;
    let attempt = 0;
    for (;;) {
      attempt++;
      let raw: RawResponse;
      try {
        raw = await this.send(
          {
            model: this.opts.model,
            system: req.system,
            messages: req.messages,
            schema: req.schema,
            maxTokens: req.maxTokens ?? 4_000,
          },
          this.opts.timeoutMs,
        );
      } catch (err) {
        const reason = classifyError(err);
        if (RETRYABLE.has(reason) && transportRetries > 0) {
          transportRetries--;
          const used = this.maxRetries - transportRetries;
          await this.sleep(this.backoffMs * 2 ** (used - 1) + Math.floor(Math.random() * 250));
          continue;
        }
        return { ok: false, reason, detail: err instanceof Error ? err.message : String(err) };
      }

      if (raw.stopReason === 'refusal') return { ok: false, reason: 'refusal' };

      const parsed = parseJson(raw.text);
      const checked = parsed.ok ? req.schema.safeParse(parsed.value) : null;
      if (checked?.success) return { ok: true, data: checked.data as z.infer<S> };

      if (validationRetries > 0) {
        validationRetries--;
        continue;
      }
      return {
        ok: false,
        reason: 'invalid_response',
        detail: raw.stopReason === 'max_tokens' ? 'truncated (max_tokens)' : `attempt ${attempt}: schema mismatch`,
      };
    }
  }
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false };
  }
}

/** Returns a client when a key is configured, otherwise null (callers switch to the offline engine). */
export function getAiClient(cfg: Config = loadConfig()): AiClient | null {
  const key = resolveApiKey(cfg);
  if (!key) return null;
  return new AiClient({ apiKey: key.key, model: resolveModel(cfg), timeoutMs: resolveTimeout(cfg) });
}
