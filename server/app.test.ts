import { describe, expect, it } from 'vitest';
import { buildApp, type AppOptions } from './app';
import { ReadError } from './gemini';
import type { PayPalClient } from './paypal';
import { createMemoryStore } from './store';
import type { FamilyView, ReceiptView } from '../shared/types';

const VISITOR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const as = (id = VISITOR) => ({ 'x-visitor-id': id });

const app = (options: Partial<AppOptions> = {}) => buildApp({ store: createMemoryStore(), ...options });
type App = Awaited<ReturnType<typeof buildApp>>;

const get = (a: App, url: string, visitor = VISITOR) => a.inject({ method: 'GET', url, headers: as(visitor) });
const post = (a: App, url: string, payload?: unknown, visitor = VISITOR) => a.inject({ method: 'POST', url, headers: as(visitor), payload: payload as never });

describe('visitors and their families', () => {
  it('needs a valid visitor id', async () => {
    const a = await app();
    expect((await a.inject({ method: 'GET', url: '/api/receipts' })).statusCode).toBe(400);
    expect((await a.inject({ method: 'GET', url: '/api/receipts', headers: as('not-a-uuid') })).statusCode).toBe(400);
    expect((await a.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200); // health needs no id
  });

  it('gives a new visitor the Rowan family with three sample receipts', async () => {
    const a = await app();
    const family = (await get(a, '/api/family')).json() as FamilyView;
    expect(family.members.map((m) => m.name)).toEqual(['Anna', 'Ben', 'Clara']);
    expect(JSON.stringify(family)).not.toMatch(/personal\.example\.com|accountId|buyer-/); // no addresses leave the server
    const receipts = (await get(a, '/api/receipts?as=anna')).json() as ReceiptView[];
    expect(receipts).toHaveLength(3);
    expect(receipts.every((r) => r.sample === true)).toBe(true);
  });

  it('keeps every visitor in their own family', async () => {
    const a = await app({ paypal: fakePayPal().client });
    const saved = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
    expect(((await get(a, '/api/receipts?as=anna')).json() as ReceiptView[]).some((r) => r.id === saved.id)).toBe(true);
    const others = (await get(a, '/api/receipts?as=anna', OTHER)).json() as ReceiptView[];
    expect(others).toHaveLength(3);
    expect(others.some((r) => r.id === saved.id)).toBe(false);
    expect((await get(a, `/api/receipts/${saved.id}?as=anna`, OTHER)).statusCode).toBe(404);
    expect((await post(a, `/api/receipts/${saved.id}/send?as=anna`, undefined, OTHER)).statusCode).toBe(404);
  });

  it('limits how many new families one visitor address can start, but not returning visitors', async () => {
    let allowed = true;
    const a = await app({ familyLimiter: () => (allowed ? { ok: true } : { ok: false, reason: 'daily' }) });
    expect((await get(a, '/api/family')).statusCode).toBe(200);
    allowed = false;
    expect((await get(a, '/api/family', OTHER)).statusCode).toBe(429); // new visitor refused...
    expect((await get(a, '/api/family')).statusCode).toBe(200); // ...existing visitor unaffected
    allowed = true;
    expect(((await get(a, '/api/receipts?as=anna', OTHER)).json() as ReceiptView[]).length).toBe(3); // nothing half-created
  });

  it('resets the demo for the organiser only, and keeps other visitors untouched', async () => {
    const a = await app();
    const saved = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
    await post(a, '/api/receipts?as=anna', newReceipt, OTHER);
    expect((await post(a, '/api/demo/reset?as=ben')).statusCode).toBe(403);
    expect((await post(a, '/api/demo/reset?as=anna')).statusCode).toBe(200);
    const after = (await get(a, '/api/receipts?as=anna')).json() as ReceiptView[];
    expect(after).toHaveLength(3);
    expect(after.some((r) => r.id === saved.id)).toBe(false);
    expect(((await get(a, '/api/receipts?as=anna', OTHER)).json() as ReceiptView[]).length).toBe(4);
  });
});

describe('GET /api/receipts', () => {
  it('shows the organiser everything', async () => {
    const receipts = (await get(await app(), '/api/receipts?as=anna')).json() as ReceiptView[];
    expect(receipts.every((r) => typeof r.totalCents === 'number' && r.shares.length === 2)).toBe(true);
  });

  it('defaults to the organiser', async () => {
    const receipts = (await get(await app(), '/api/receipts')).json() as ReceiptView[];
    expect(receipts[0].totalCents).toBeTypeOf('number');
  });

  it('shows a sibling only their own share, with no total and no one else amounts', async () => {
    const receipts = (await get(await app(), '/api/receipts?as=ben')).json() as ReceiptView[];
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
    expect((await get(await app(), '/api/receipts?as=zoe')).statusCode).toBe(400);
  });
});

describe('POST /api/receipts/read', () => {
  const reading = { merchant: 'X', date: '2026-10-02', currency: 'USD', items: [{ name: 'a', quantity: null, lineTotalCents: 100 }], subtotalCents: 100, discountCents: null, taxCents: null, totalCents: 100 };
  const read = (a: App, who = 'anna', body: Buffer | string = Buffer.from('img'), type = 'image/png') =>
    a.inject({ method: 'POST', url: `/api/receipts/read?as=${who}`, headers: { ...as(), 'content-type': type }, payload: body });

  it('returns the reading for the organiser', async () => {
    const res = await read(await app({ reader: async () => reading }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(reading);
  });

  it('does not keep the photo: only the reading can end up in the store', async () => {
    const store = createMemoryStore();
    const a = await buildApp({ store, reader: async () => reading });
    const photo = Buffer.from('PHOTO-BYTES-MARKER-12345');
    const result = await read(a, 'anna', photo);
    expect(result.statusCode).toBe(200);
    const saved = await post(a, '/api/receipts?as=anna', { ...reading, totalCents: 100 });
    expect(saved.statusCode).toBe(201);
    const everything = JSON.stringify(await store.receipts(VISITOR).list()) + JSON.stringify(await store.getFamily(VISITOR));
    expect(everything).not.toContain('PHOTO-BYTES-MARKER');
    expect(everything).not.toContain(photo.toString('base64'));
    expect(JSON.stringify(result.json())).not.toContain('PHOTO-BYTES-MARKER');
  });

  it('refuses siblings, unsupported types and empty bodies', async () => {
    const a = await app({ reader: async () => reading });
    expect((await read(a, 'ben')).statusCode).toBe(403);
    expect((await read(a, 'anna', 'hello', 'text/plain')).statusCode).toBe(400);
    expect((await read(a, 'anna', 'hello', 'application/pdf')).statusCode).toBe(415);
    expect((await read(a, 'anna', '')).statusCode).toBe(400);
  });

  it('says 503 when reading is not set up', async () => {
    const res = await read(await app());
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('not_configured');
  });

  it('applies the limiter before reading', async () => {
    let reads = 0;
    const a = await app({ reader: async () => (reads++, reading), limiter: () => ({ ok: false, reason: 'rate' }) });
    expect((await read(a)).statusCode).toBe(429);
    expect(reads).toBe(0);
  });

  it('maps reading errors to friendly messages without leaking details', async () => {
    const busy = await read(await app({ reader: async () => Promise.reject(new ReadError('busy', 'secret detail')) }));
    expect(busy.statusCode).toBe(503);
    expect(busy.json().error).toContain('busy');
    expect(JSON.stringify(busy.json())).not.toContain('secret detail');
    expect((await read(await app({ reader: async () => Promise.reject(new ReadError('unreadable', 'x')) }))).statusCode).toBe(422);
  });
});

describe('GET /api/receipts/:id', () => {
  it('applies the same visibility rules and returns 404 for unknown ids', async () => {
    const a = await app();
    const ok = await get(a, '/api/receipts/sample-green-leaf?as=clara');
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as ReceiptView).shares.map((s) => s.memberId)).toEqual(['clara']);
    expect((await get(a, '/api/receipts/nope')).statusCode).toBe(404);
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
    async createDraft(req: { recipientName: string; recipientEmail: string; amountCents: number }) {
      log.push(`create:${req.recipientName}:${req.amountCents}:${req.recipientEmail}`);
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
    const res = await post(a, '/api/receipts?as=anna', newReceipt);
    expect(res.statusCode).toBe(201);
    const view = res.json() as ReceiptView;
    expect(view.totalCents).toBe(4668);
    expect(view.payerShareCents).toBe(1556);
    expect(view.shares).toEqual([
      { memberId: 'ben', amountCents: 1556, status: 'DRAFT' },
      { memberId: 'clara', amountCents: 1556, status: 'DRAFT' },
    ]);
    expect(view.sample).toBeUndefined();
    const list = (await get(a, '/api/receipts?as=anna')).json() as ReceiptView[];
    expect(list.some((r) => r.id === view.id)).toBe(true);
  });

  it('refuses siblings and invalid receipts', async () => {
    const a = await app();
    expect((await post(a, '/api/receipts?as=ben', newReceipt)).statusCode).toBe(403);
    expect((await post(a, '/api/receipts?as=anna', { ...newReceipt, totalCents: 0 })).statusCode).toBe(400);
    expect((await post(a, '/api/receipts?as=anna', { ...newReceipt, currency: 'EUR' })).statusCode).toBe(400);
    expect((await post(a, '/api/receipts?as=anna', { ...newReceipt, items: [] })).statusCode).toBe(400);
  });

  it('sends one invoice per sibling, only to the family\'s sandbox accounts, and saves the links', async () => {
    const { client, log } = fakePayPal();
    const a = await app({ paypal: client });
    const saved = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
    const res = await post(a, `/api/receipts/${saved.id}/send?as=anna`);
    const body = res.json() as { receipt: ReceiptView; failed: unknown[] };
    expect(res.statusCode).toBe(200);
    expect(body.failed).toEqual([]);
    expect(body.receipt.shares.map((s) => s.status)).toEqual(['SENT', 'SENT']);
    expect(body.receipt.shares[0].invoiceUrl).toBe('https://sandbox.example/INV-1');
    expect(log.filter((l) => l.startsWith('create:'))).toEqual([
      'create:Ben:1556:sb-cxgha53183684@personal.example.com',
      'create:Clara:1556:sb-r1goj53183689@personal.example.com',
    ]);
    const ben = (await get(a, `/api/receipts/${saved.id}?as=ben`)).json() as ReceiptView;
    expect(ben.shares).toHaveLength(1);
    expect(ben.shares[0].invoiceUrl).toBe('https://sandbox.example/INV-1');
  });

  it('never creates a second invoice when sending again after a failure or a double click', async () => {
    const failing = fakePayPal({ failSendFor: 'INV-2' });
    const a = await app({ paypal: failing.client });
    const saved = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;

    const first = (await post(a, `/api/receipts/${saved.id}/send?as=anna`)).json() as { receipt: ReceiptView; failed: { memberId: string }[] };
    expect(first.failed.map((f) => f.memberId)).toEqual(['clara']);
    expect(first.receipt.shares.map((s) => s.status)).toEqual(['SENT', 'DRAFT']);

    await post(a, `/api/receipts/${saved.id}/send?as=anna`);
    expect(failing.log.filter((l) => l.startsWith('create:'))).toHaveLength(2);

    const healthy = fakePayPal();
    const b = await app({ paypal: healthy.client });
    const r2 = (await post(b, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
    await Promise.all([post(b, `/api/receipts/${r2.id}/send?as=anna`), post(b, `/api/receipts/${r2.id}/send?as=anna`)]);
    expect(healthy.log.filter((l) => l.startsWith('create:'))).toHaveLength(2);
  });

  it('refuses siblings, missing receipts, sample receipts and a server without PayPal', async () => {
    const { client, log } = fakePayPal();
    const a = await app({ paypal: client });
    expect((await post(a, '/api/receipts/sample-green-leaf/send?as=ben')).statusCode).toBe(403);
    expect((await post(a, '/api/receipts/nope/send?as=anna')).statusCode).toBe(404);
    expect((await post(a, '/api/receipts/sample-green-leaf/send?as=anna')).statusCode).toBe(400);
    expect((await post(a, '/api/receipts/sample-green-leaf/refresh?as=anna')).statusCode).toBe(400);
    expect(log).toEqual([]);
    expect((await post(await app(), '/api/receipts/sample-green-leaf/send?as=anna')).statusCode).toBe(503);
  });

  it('refreshes statuses from PayPal', async () => {
    const { client } = fakePayPal();
    const paidClient = { ...client, get: async (id: string) => ({ id, status: 'MARKED_AS_PAID', recipientViewUrl: `https://sandbox.example/${id}` }) } as unknown as PayPalClient;
    const store = createMemoryStore();
    const a = await buildApp({ store, paypal: client });
    const saved = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
    await post(a, `/api/receipts/${saved.id}/send?as=anna`);
    const b = await buildApp({ store, paypal: paidClient });
    const res = await post(b, `/api/receipts/${saved.id}/refresh?as=anna`);
    expect((res.json() as { receipt: ReceiptView }).receipt.shares.map((s) => s.status)).toEqual(['PAID', 'PAID']);
  });

  it('limits how many receipts one visitor can save', async () => {
    const a = await app({ writeLimiter: () => ({ ok: false, reason: 'daily' }) });
    expect((await post(a, '/api/receipts?as=anna', newReceipt)).statusCode).toBe(429);
    expect(((await get(a, '/api/receipts?as=anna')).json() as ReceiptView[]).length).toBe(3); // nothing was saved
  });

  it('judges visitors by the address Google adds, not by a header they send themselves', async () => {
    const seen: string[] = [];
    const a = await app({ writeLimiter: (ip) => (seen.push(ip), { ok: true }) });
    await a.inject({
      method: 'POST',
      url: '/api/receipts?as=anna',
      payload: newReceipt,
      headers: { ...as(), 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, // the first is faked by the visitor, the last is added by the proxy
    });
    expect(seen).toEqual(['203.0.113.9']);
  });

  it('applies the PayPal limiter', async () => {
    const { client, log } = fakePayPal();
    const a = await app({ paypal: client, paypalLimiter: () => ({ ok: false, reason: 'rate' }) });
    const saved = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
    expect((await post(a, `/api/receipts/${saved.id}/send?as=anna`)).statusCode).toBe(429);
    expect(log).toEqual([]);
  });
});
