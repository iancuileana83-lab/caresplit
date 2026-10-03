import { describe, expect, it } from 'vitest';
import { buildApp, type AppOptions } from './app';
import { sampleReceipts } from './demo-data';
import { ReadError } from './gemini';
import type { PayPalClient } from './paypal';
import { createMemoryStore } from './store';
import type { ReceiptView } from '../shared/types';

const app = (options: Partial<AppOptions> = {}) => buildApp({ store: createMemoryStore(sampleReceipts()), ...options });

async function receiptsAs(as?: string) {
  const res = await (await app()).inject({ method: 'GET', url: as ? `/api/receipts?as=${as}` : '/api/receipts' });
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
  const post = (a: Awaited<ReturnType<typeof buildApp>>, as = 'anna', body: Buffer | string = Buffer.from('img'), type = 'image/png') =>
    a.inject({ method: 'POST', url: `/api/receipts/read?as=${as}`, headers: { 'content-type': type }, payload: body });

  it('returns the reading for the organiser', async () => {
    const res = await post(await app({ reader: async () => reading }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(reading);
  });

  it('refuses siblings, unsupported types and empty bodies', async () => {
    const a = await app({ reader: async () => reading });
    expect((await post(a, 'ben')).statusCode).toBe(403);
    expect((await post(a, 'anna', 'hello', 'text/plain')).statusCode).toBe(400);
    expect((await post(a, 'anna', 'hello', 'application/pdf')).statusCode).toBe(415);
    expect((await post(a, 'anna', '')).statusCode).toBe(400);
  });

  it('says 503 when reading is not set up', async () => {
    const res = await post(await app());
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('not_configured');
  });

  it('applies the limiter before reading', async () => {
    let reads = 0;
    const a = await app({ reader: async () => (reads++, reading), limiter: () => ({ ok: false, reason: 'rate' }) });
    expect((await post(a)).statusCode).toBe(429);
    expect(reads).toBe(0);
  });

  it('maps reading errors to friendly messages without leaking details', async () => {
    const busy = await post(await app({ reader: async () => Promise.reject(new ReadError('busy', 'secret detail')) }));
    expect(busy.statusCode).toBe(503);
    expect(busy.json().error).toContain('busy');
    expect(JSON.stringify(busy.json())).not.toContain('secret detail');
    const bad = await post(await app({ reader: async () => Promise.reject(new ReadError('unreadable', 'x')) }));
    expect(bad.statusCode).toBe(422);
  });
});

describe('GET /api/receipts/:id', () => {
  it('applies the same visibility rules and returns 404 for unknown ids', async () => {
    const a = await app();
    const ok = await a.inject({ method: 'GET', url: '/api/receipts/r-green-leaf?as=clara' });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as ReceiptView).shares.map((s) => s.memberId)).toEqual(['clara']);
    expect((await a.inject({ method: 'GET', url: '/api/receipts/nope' })).statusCode).toBe(404);
  });
});

const newReceipt = {
  merchant: 'Hillcrest Family Pharmacy',
  date: '2026-10-01',
  currency: 'USD',
  items: [{ name: 'Item', quantity: null, lineTotalCents: 4668 }],
  subtotalCents: 4404,
  discountCents: null,
  taxCents: 264,
  totalCents: 4668,
};

// A PayPal stand-in that records what it was asked and can be told to fail.
function fakePayPal(opts: { failSendFor?: string } = {}) {
  const log: string[] = [];
  let n = 0;
  const client = {
    async createDraft(req: { recipientName: string; amountCents: number }) {
      log.push(`create:${req.recipientName}:${req.amountCents}`);
      return { id: `INV-${++n}`, status: 'DRAFT', number: `000${n}` };
    },
    async send(id: string) {
      log.push(`send:${id}`);
      if (opts.failSendFor === id) throw new Error('PayPal is down');
    },
    async get(id: string) {
      log.push(`get:${id}`);
      return { id, status: 'SENT', number: '0001', recipientViewUrl: `https://sandbox.example/${id}` };
    },
  } as unknown as PayPalClient;
  return { client, log };
}

describe('saving and sending receipts', () => {
  it('saves a receipt with an equal split and nothing sent yet', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/receipts?as=anna', payload: newReceipt });
    expect(res.statusCode).toBe(201);
    const view = res.json() as ReceiptView;
    expect(view.totalCents).toBe(4668);
    expect(view.payerShareCents).toBe(1556);
    expect(view.shares).toEqual([
      { memberId: 'ben', amountCents: 1556, status: 'DRAFT' },
      { memberId: 'clara', amountCents: 1556, status: 'DRAFT' },
    ]);
    const list = (await a.inject({ method: 'GET', url: '/api/receipts?as=anna' })).json() as ReceiptView[];
    expect(list.some((r) => r.id === view.id)).toBe(true);
  });

  it('refuses siblings and invalid receipts', async () => {
    const a = await app();
    expect((await a.inject({ method: 'POST', url: '/api/receipts?as=ben', payload: newReceipt })).statusCode).toBe(403);
    expect((await a.inject({ method: 'POST', url: '/api/receipts?as=anna', payload: { ...newReceipt, totalCents: 0 } })).statusCode).toBe(400);
    expect((await a.inject({ method: 'POST', url: '/api/receipts?as=anna', payload: { ...newReceipt, currency: 'EUR' } })).statusCode).toBe(400);
    expect((await a.inject({ method: 'POST', url: '/api/receipts?as=anna', payload: { ...newReceipt, items: [] } })).statusCode).toBe(400);
  });

  it('sends one invoice per sibling and saves the links', async () => {
    const { client, log } = fakePayPal();
    const a = await app({ paypal: client });
    const saved = (await a.inject({ method: 'POST', url: '/api/receipts?as=anna', payload: newReceipt })).json() as ReceiptView;
    const res = await a.inject({ method: 'POST', url: `/api/receipts/${saved.id}/send?as=anna` });
    const body = res.json() as { receipt: ReceiptView; failed: unknown[] };
    expect(res.statusCode).toBe(200);
    expect(body.failed).toEqual([]);
    expect(body.receipt.shares.map((s) => s.status)).toEqual(['SENT', 'SENT']);
    expect(body.receipt.shares[0].invoiceUrl).toBe('https://sandbox.example/INV-1');
    expect(log.filter((l) => l.startsWith('create:'))).toEqual(['create:Ben:1556', 'create:Clara:1556']);
    // The sibling sees only their own invoice link.
    const ben = (await a.inject({ method: 'GET', url: `/api/receipts/${saved.id}?as=ben` })).json() as ReceiptView;
    expect(ben.shares).toHaveLength(1);
    expect(ben.shares[0].invoiceUrl).toBe('https://sandbox.example/INV-1');
  });

  it('never creates a second invoice when sending again after a failure or a double click', async () => {
    const failing = fakePayPal({ failSendFor: 'INV-2' });
    const a = await app({ paypal: failing.client });
    const saved = (await a.inject({ method: 'POST', url: '/api/receipts?as=anna', payload: newReceipt })).json() as ReceiptView;

    const first = (await a.inject({ method: 'POST', url: `/api/receipts/${saved.id}/send?as=anna` })).json() as { receipt: ReceiptView; failed: { memberId: string }[] };
    expect(first.failed.map((f) => f.memberId)).toEqual(['clara']);
    expect(first.receipt.shares.map((s) => s.status)).toEqual(['SENT', 'DRAFT']);

    // Second try: Clara's draft already exists, so only "send" runs again.
    await a.inject({ method: 'POST', url: `/api/receipts/${saved.id}/send?as=anna` });
    expect(failing.log.filter((l) => l.startsWith('create:'))).toHaveLength(2);

    // Two clicks at once on a healthy receipt: still one invoice each.
    const healthy = fakePayPal();
    const b = await app({ paypal: healthy.client });
    const r2 = (await b.inject({ method: 'POST', url: '/api/receipts?as=anna', payload: newReceipt })).json() as ReceiptView;
    await Promise.all([b.inject({ method: 'POST', url: `/api/receipts/${r2.id}/send?as=anna` }), b.inject({ method: 'POST', url: `/api/receipts/${r2.id}/send?as=anna` })]);
    expect(healthy.log.filter((l) => l.startsWith('create:'))).toHaveLength(2);
  });

  it('refuses siblings, missing receipts and a server without PayPal', async () => {
    const { client } = fakePayPal();
    const a = await app({ paypal: client });
    expect((await a.inject({ method: 'POST', url: '/api/receipts/r-green-leaf/send?as=ben' })).statusCode).toBe(403);
    expect((await a.inject({ method: 'POST', url: '/api/receipts/nope/send?as=anna' })).statusCode).toBe(404);
    expect((await (await app()).inject({ method: 'POST', url: '/api/receipts/r-green-leaf/send?as=anna' })).statusCode).toBe(503);
  });

  it('refreshes statuses from PayPal', async () => {
    const { client } = fakePayPal();
    const paidClient = { ...client, get: async (id: string) => ({ id, status: 'MARKED_AS_PAID', recipientViewUrl: `https://sandbox.example/${id}` }) } as unknown as PayPalClient;
    const store = createMemoryStore();
    const a = await buildApp({ store, paypal: client });
    const saved = (await a.inject({ method: 'POST', url: '/api/receipts?as=anna', payload: newReceipt })).json() as ReceiptView;
    await a.inject({ method: 'POST', url: `/api/receipts/${saved.id}/send?as=anna` });
    const b = await buildApp({ store, paypal: paidClient });
    const res = await b.inject({ method: 'POST', url: `/api/receipts/${saved.id}/refresh?as=anna` });
    expect((res.json() as { receipt: ReceiptView }).receipt.shares.map((s) => s.status)).toEqual(['PAID', 'PAID']);
  });

  it('applies the PayPal limiter', async () => {
    const { client, log } = fakePayPal();
    const a = await app({ paypal: client, paypalLimiter: () => ({ ok: false, reason: 'rate' }) });
    expect((await a.inject({ method: 'POST', url: '/api/receipts/r-green-leaf/send?as=anna' })).statusCode).toBe(429);
    expect(log).toEqual([]);
  });
});
