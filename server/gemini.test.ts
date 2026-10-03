import { describe, expect, it, vi } from 'vitest';
import { createReader, normalizeReading, ReadError } from './gemini';

const good = {
  merchant: 'GREEN LEAF PHARMACY',
  date: '2026-10-02',
  currency: 'usd',
  items: [
    { name: 'Pain relief tablets 24ct', quantity: null, lineTotal: 7.49 },
    { name: 'Cough lozenges', quantity: 2, lineTotal: 7 },
  ],
  subtotal: 14.49,
  discount: null,
  tax: 0.87,
  total: 15.36,
};

const ok = (body: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), { status: 200 });
const status = (code: number) => new Response('{}', { status: code });
const image = { data: Buffer.from('fake'), mimeType: 'image/png' };
const noWait = async () => {};

function reader(responses: (Response | Error)[], extra: Partial<Parameters<typeof createReader>[0]> = {}) {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url).match(/models\/([^:]+):/)?.[1] ?? '?');
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra call');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { read: createReader({ apiKey: 'test-key', models: ['main', 'backup'], fetchFn, sleep: noWait, ...extra }), calls };
}

describe('createReader', () => {
  it('reads a receipt and converts dollars to cents', async () => {
    const { read } = reader([ok(good)]);
    const r = await read(image);
    expect(r.merchant).toBe('GREEN LEAF PHARMACY');
    expect(r.currency).toBe('USD');
    expect(r.items).toEqual([
      { name: 'Pain relief tablets 24ct', quantity: null, lineTotalCents: 749 },
      { name: 'Cough lozenges', quantity: 2, lineTotalCents: 700 },
    ]);
    expect(r.totalCents).toBe(1536);
    expect(r.discountCents).toBeNull();
  });

  it('retries a temporary 503 and then succeeds on the same model', async () => {
    const { read, calls } = reader([status(503), status(503), ok(good)]);
    await read(image);
    expect(calls).toEqual(['main', 'main', 'main']);
  });

  it('switches to the backup model when the main one stays busy', async () => {
    const { read, calls } = reader([status(503), status(503), status(503), ok(good)]);
    await read(image);
    expect(calls).toEqual(['main', 'main', 'main', 'backup']);
  });

  it('goes straight to the backup model when the main one no longer exists', async () => {
    const { read, calls } = reader([status(404), ok(good)]);
    await read(image);
    expect(calls).toEqual(['main', 'backup']);
  });

  it('goes straight to the next model when a quota is used up (429), without retrying', async () => {
    const { read, calls } = reader([status(429), status(429), ok(good)], { models: ['a', 'b', 'c'] });
    await read(image);
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('treats a network error or timeout like a busy service', async () => {
    const { read, calls } = reader([new Error('network down'), ok(good)]);
    await read(image);
    expect(calls).toEqual(['main', 'main']);
  });

  it('gives up with "busy" when every attempt fails', async () => {
    const { read } = reader(Array.from({ length: 6 }, () => status(503)));
    await expect(read(image)).rejects.toMatchObject({ code: 'busy' });
  });

  it('does not retry a refused request (bad key or request)', async () => {
    const { read, calls } = reader([status(403)]);
    await expect(read(image)).rejects.toMatchObject({ code: 'service' });
    expect(calls).toEqual(['main']);
  });

  it('says "not configured" without a key and never calls the service', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const read = createReader({ apiKey: undefined, models: ['main'], fetchFn });
    await expect(read(image)).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('reports unreadable for an empty or broken answer', async () => {
    await expect(reader([ok({ items: [], total: null })]).read(image)).rejects.toMatchObject({ code: 'unreadable' });
    await expect(reader([new Response(JSON.stringify({ candidates: [] }), { status: 200 })]).read(image)).rejects.toMatchObject({ code: 'unreadable' });
    const notJson = new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }), { status: 200 });
    await expect(reader([notJson]).read(image)).rejects.toBeInstanceOf(ReadError);
  });
});

describe('normalizeReading', () => {
  it('drops bad items, bad dates and bad currencies instead of failing', () => {
    const r = normalizeReading({
      merchant: '  ',
      date: '2026-02-30',
      currency: 'dollars',
      items: [{ name: 'Good', lineTotal: 1.1 }, { name: 'No price' }, 'junk', { name: '', lineTotal: 2 }, { name: 'Odd qty', quantity: 1.5, lineTotal: 3 }],
      total: 4.1,
    });
    expect(r.merchant).toBeNull();
    expect(r.date).toBeNull();
    expect(r.currency).toBeNull();
    expect(r.items).toEqual([
      { name: 'Good', quantity: null, lineTotalCents: 110 },
      { name: 'Odd qty', quantity: null, lineTotalCents: 300 },
    ]);
  });

  it('avoids float noise when converting to cents', () => {
    expect(normalizeReading({ items: [{ name: 'x', lineTotal: 0.1 + 0.2 }], total: 1.005 + 0.005 }).items[0].lineTotalCents).toBe(30);
  });
});
