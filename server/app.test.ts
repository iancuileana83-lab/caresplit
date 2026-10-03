import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { ReadError } from './gemini';
import type { ReceiptView } from '../shared/types';

async function receiptsAs(as?: string) {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: as ? `/api/receipts?as=${as}` : '/api/receipts' });
  return { status: res.statusCode, body: res.json() };
}

describe('GET /api/receipts', () => {
  it('shows the organiser everything', async () => {
    const { status, body } = await receiptsAs('anna');
    const receipts = body as ReceiptView[];
    expect(status).toBe(200);
    expect(receipts).toHaveLength(3);
    expect(receipts.every((r) => typeof r.totalCents === 'number' && r.shares.length === 2)).toBe(true);
  });

  it('defaults to the organiser', async () => {
    const { body } = await receiptsAs();
    expect((body as ReceiptView[])[0].totalCents).toBeTypeOf('number');
  });

  it('shows a sibling only their own share, with no total and no one else amounts', async () => {
    const { body } = await receiptsAs('ben');
    const receipts = body as ReceiptView[];
    expect(receipts).toHaveLength(3);
    for (const r of receipts) {
      expect(r.totalCents).toBeUndefined();
      expect(r.payerShareCents).toBeUndefined();
      expect(r.shares).toHaveLength(1);
      expect(r.shares[0].memberId).toBe('ben');
    }
    expect(JSON.stringify(receipts)).not.toContain('clara');
  });

  it('rejects an unknown member', async () => {
    const { status } = await receiptsAs('zoe');
    expect(status).toBe(400);
  });
});

describe('POST /api/receipts/read', () => {
  const reading = { merchant: 'X', date: '2026-10-02', currency: 'USD', items: [{ name: 'a', quantity: null, lineTotalCents: 100 }], subtotalCents: 100, discountCents: null, taxCents: null, totalCents: 100 };
  const post = (app: Awaited<ReturnType<typeof buildApp>>, as = 'anna', body: Buffer | string = Buffer.from('img'), type = 'image/png') =>
    app.inject({ method: 'POST', url: `/api/receipts/read?as=${as}`, headers: { 'content-type': type }, payload: body });

  it('returns the reading for the organiser', async () => {
    const app = await buildApp({ reader: async () => reading });
    const res = await post(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(reading);
  });

  it('refuses siblings, unsupported types and empty bodies', async () => {
    const app = await buildApp({ reader: async () => reading });
    expect((await post(app, 'ben')).statusCode).toBe(403);
    expect((await post(app, 'anna', 'hello', 'text/plain')).statusCode).toBe(400);
    expect((await post(app, 'anna', 'hello', 'application/pdf')).statusCode).toBe(415);
    expect((await post(app, 'anna', '')).statusCode).toBe(400);
  });

  it('says 503 when reading is not set up', async () => {
    const res = await post(await buildApp());
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('not_configured');
  });

  it('applies the limiter before reading', async () => {
    let reads = 0;
    const app = await buildApp({
      reader: async () => (reads++, reading),
      limiter: () => ({ ok: false, reason: 'rate' }),
    });
    const res = await post(app);
    expect(res.statusCode).toBe(429);
    expect(reads).toBe(0);
  });

  it('maps reading errors to friendly messages without leaking details', async () => {
    const busy = await post(await buildApp({ reader: async () => Promise.reject(new ReadError('busy', 'secret detail')) }));
    expect(busy.statusCode).toBe(503);
    expect(busy.json().error).toContain('busy');
    expect(JSON.stringify(busy.json())).not.toContain('secret detail');
    const bad = await post(await buildApp({ reader: async () => Promise.reject(new ReadError('unreadable', 'x')) }));
    expect(bad.statusCode).toBe(422);
  });
});

describe('GET /api/receipts/:id', () => {
  it('applies the same visibility rules and returns 404 for unknown ids', async () => {
    const app = await buildApp();
    const ok = await app.inject({ method: 'GET', url: '/api/receipts/r-green-leaf?as=clara' });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as ReceiptView).shares.map((s) => s.memberId)).toEqual(['clara']);
    const missing = await app.inject({ method: 'GET', url: '/api/receipts/nope' });
    expect(missing.statusCode).toBe(404);
  });
});
