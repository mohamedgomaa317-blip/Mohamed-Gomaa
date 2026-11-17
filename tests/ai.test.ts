import { describe, expect, it, vi } from 'vitest';
import { AiClient, classifyError, getAiClient, type SendFn } from '../src/ai/client.js';
import { ChatReplySchema } from '../src/ai/schemas.js';
import { defaultConfig } from '../src/config.js';

const good = JSON.stringify({ reply: 'Hi! How are you?', corrections: [], encouragement: 'Great start!' });
const req = { system: 's', messages: [{ role: 'user' as const, content: 'hello' }], schema: ChatReplySchema };
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

function client(send: SendFn) {
  return new AiClient({
    apiKey: 'sk-ant-test',
    model: 'm',
    timeoutMs: 1000,
    send,
    sleep: async () => {},
    backoffMs: 1,
  });
}

describe('AiClient.structured', () => {
  it('returns validated data on success', async () => {
    const r = await client(async () => ({ stopReason: 'end_turn', text: good })).structured(req);
    expect(r).toEqual({ ok: true, data: JSON.parse(good) });
  });

  it('retries 429 and 5xx up to 2 times, then succeeds', async () => {
    const send = vi
      .fn<SendFn>()
      .mockRejectedValueOnce(httpError(429))
      .mockRejectedValueOnce(httpError(529))
      .mockResolvedValue({ stopReason: 'end_turn', text: good });
    const r = await client(send).structured(req);
    expect(r.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('gives up after 2 retries', async () => {
    const send = vi.fn<SendFn>().mockRejectedValue(httpError(503));
    const r = await client(send).structured(req);
    expect(r).toMatchObject({ ok: false, reason: 'server' });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('does not retry auth or bad requests', async () => {
    const send = vi.fn<SendFn>().mockRejectedValue(httpError(401));
    expect(await client(send).structured(req)).toMatchObject({ ok: false, reason: 'auth' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries a malformed response exactly once, then fails gracefully', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ stopReason: 'end_turn', text: '{"reply": 42}' });
    const r = await client(send).structured(req);
    expect(r).toMatchObject({ ok: false, reason: 'invalid_response' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('recovers when the retry returns valid JSON', async () => {
    const send = vi
      .fn<SendFn>()
      .mockResolvedValueOnce({ stopReason: 'end_turn', text: 'not json' })
      .mockResolvedValueOnce({ stopReason: 'end_turn', text: '```json\n' + good + '\n```' });
    expect((await client(send).structured(req)).ok).toBe(true);
  });

  it('reports refusals without retrying', async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ stopReason: 'refusal', text: '' });
    expect(await client(send).structured(req)).toMatchObject({ ok: false, reason: 'refusal' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never throws, even on unexpected errors', async () => {
    const r = await client(async () => {
      throw new TypeError('boom');
    }).structured(req);
    expect(r).toMatchObject({ ok: false, reason: 'unknown' });
  });
});

describe('classifyError', () => {
  it('maps statuses and network codes', () => {
    expect(classifyError(httpError(429))).toBe('rate_limit');
    expect(classifyError(httpError(500))).toBe('server');
    expect(classifyError(httpError(403))).toBe('auth');
    expect(classifyError(httpError(404))).toBe('bad_request');
    expect(classifyError(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe('network');
    expect(classifyError(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe('timeout');
  });
});

describe('getAiClient', () => {
  it('returns null without a key (offline mode)', () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(getAiClient(defaultConfig())).toBeNull();
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
  });
  it('uses ANTHROPIC_MODEL when set', () => {
    process.env.ANTHROPIC_MODEL = 'my-model';
    const c = getAiClient({ ...defaultConfig(), api: { apiKey: 'sk-ant-x', timeoutMs: 45_000 } });
    expect(c?.model).toBe('my-model');
    delete process.env.ANTHROPIC_MODEL;
  });
});
