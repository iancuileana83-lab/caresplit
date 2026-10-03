import { describe, expect, it, vi } from 'vitest';
import { ChatError, createChatModel, type ModelRequest } from './model';

const request: ModelRequest = { system: 'sys', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], tools: [{ functionDeclarations: [{ name: 't' }] }] };
const ok = (parts: unknown[]) => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts } }] }), { status: 200 });
const status = (code: number) => new Response('{}', { status: code });
const noWait = async () => {};

function model(responses: (Response | Error)[], extra: Partial<Parameters<typeof createChatModel>[0]> = {}) {
  const calls: { model: string; init: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ model: String(url).match(/models\/([^:]+):/)?.[1] ?? '?', init });
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra call');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { chat: createChatModel({ apiKey: 'secret-key', models: ['a', 'b', 'c'], fetchFn, sleep: noWait, ...extra }), calls };
}

describe('createChatModel', () => {
  it('sends the system text, the conversation, the tools and the key (in a header only)', async () => {
    const { chat, calls } = model([ok([{ text: 'hello' }])]);
    await chat.generate(request);
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.systemInstruction.parts[0].text).toBe('sys');
    expect(sent.contents).toEqual(request.contents);
    expect(sent.tools).toEqual(request.tools);
    expect(sent.toolConfig.functionCallingConfig.mode).toBe('AUTO');
    expect(String(calls[0].init.body)).not.toContain('secret-key');
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
  });

  it('returns the text, the tool calls, and the model content untouched (thought signatures included)', async () => {
    const parts = [{ functionCall: { name: 'get_summary', args: { from: '2026-09-01' } }, thoughtSignature: 'sig-1' }, { text: 'thinking aloud', thought: true }, { text: 'Visible' }];
    const reply = await model([ok(parts)]).chat.generate(request);
    expect(reply.calls).toEqual([{ name: 'get_summary', args: { from: '2026-09-01' } }]);
    expect(reply.text).toBe('Visible'); // hidden thoughts are not shown
    expect(reply.content).toEqual({ role: 'model', parts });
    expect(reply.model).toBe('a');
  });

  it('retries a temporary 503 on the same model, and a network error too', async () => {
    const { chat, calls } = model([status(503), new Error('network down'), ok([{ text: 'ok' }])], { attemptsPerModel: 3 });
    expect((await chat.generate(request)).text).toBe('ok');
    expect(calls.map((c) => c.model)).toEqual(['a', 'a', 'a']);
  });

  it('moves straight to the next model when a quota is used up (429) or a model is gone (404)', async () => {
    const { chat, calls } = model([status(429), status(404), ok([{ text: 'from c' }])]);
    const reply = await chat.generate(request);
    expect(calls.map((c) => c.model)).toEqual(['a', 'b', 'c']);
    expect(reply).toMatchObject({ text: 'from c', model: 'c' });
  });

  it('says "busy" when every model fails, and "service" without retrying for a refused request', async () => {
    const busy = model(Array.from({ length: 6 }, () => status(503)));
    await expect(busy.chat.generate(request)).rejects.toMatchObject({ code: 'busy' });
    const refused = model([status(403)]);
    await expect(refused.chat.generate(request)).rejects.toMatchObject({ code: 'service' });
    expect(refused.calls).toHaveLength(1);
  });

  it('without a key it says so and never calls Gemini', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const chat = createChatModel({ apiKey: undefined, models: ['a'], fetchFn });
    await expect(chat.generate(request)).rejects.toBeInstanceOf(ChatError);
    await expect(chat.generate(request)).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('stops at the daily budget for the whole app, counting retries, and starts again the next day', async () => {
    let t = Date.parse('2026-10-04T10:00:00Z');
    const { chat, calls } = model([ok([{ text: '1' }]), status(503), ok([{ text: '2' }]), ok([{ text: '3' }])], { dailyBudget: 3, now: () => t, attemptsPerModel: 2 });
    await chat.generate(request); // request 1
    await chat.generate(request); // requests 2 (503) and 3
    await expect(chat.generate(request)).rejects.toMatchObject({ code: 'budget' });
    expect(calls).toHaveLength(3); // nothing was sent once the budget was gone
    t = Date.parse('2026-10-05T00:00:01Z');
    expect((await chat.generate(request)).text).toBe('3');
  });

  it('keeps chat off the models used for reading receipts', async () => {
    const { DEFAULT_CHAT_MODELS } = await import('./model');
    const { DEFAULT_MODELS } = await import('../gemini');
    expect(DEFAULT_CHAT_MODELS.filter((m) => DEFAULT_MODELS.includes(m))).toEqual([]);
  });

  it('counts every request it makes, so the quota used can be seen', async () => {
    const seen: string[] = [];
    const { chat } = model([status(429), status(503), ok([{ text: 'x' }])], { onRequest: (m) => seen.push(m), attemptsPerModel: 2 });
    await chat.generate(request);
    expect(seen).toEqual(['a', 'b', 'b']);
  });
});
