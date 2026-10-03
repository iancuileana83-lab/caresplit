import { describe, expect, it } from 'vitest';
import { buildApp, type AppOptions } from './app';
import { ReadError } from './gemini';
import { PayPalError, type PayPalClient } from './paypal';
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
    expect(JSON.stringify(family)).not.toMatch(/personal\.example\.com|@/); // no addresses leave the server
    expect(family.accounts.map((a) => a.id)).toEqual(['buyer-a', 'buyer-b', 'buyer-c', 'buyer-d']);
    expect(family.splitRule).toEqual({ type: 'equal' });
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
function fakePayPal(opts: { failSendFor?: string; failCancel?: boolean; failRecord?: boolean; ignoreDiscount?: boolean } = {}) {
  const log: string[] = [];
  /** What PayPal currently says about each invoice; tests can change it (for example to PAID). */
  const states = new Map<string, string>();
  let n = 0;
  const client = {
    async createDraft(req: { recipientName: string; recipientEmail: string; amountCents: number; itemDescription: string; discountCents?: number }) {
      log.push(`create:${req.recipientName}:${req.amountCents}:${req.recipientEmail}`);
      log.push(`description:${req.itemDescription}`);
      log.push(`discount:${req.recipientName}:${req.discountCents ?? 0}`);
      const id = `INV-${++n}`;
      states.set(id, 'DRAFT');
      // PayPal's total is the item price minus the item discount (unless a test makes it ignore the discount).
      const totalCents = req.amountCents - (opts.ignoreDiscount ? 0 : (req.discountCents ?? 0));
      return { id, status: 'DRAFT', number: `000${n}`, totalCents };
    },
    async send(id: string) {
      log.push(`send:${id}`);
      if (opts.failSendFor === id) throw new Error('PayPal is down');
      states.set(id, 'SENT');
    },
    async get(id: string) {
      log.push(`get:${id}`);
      return { id, status: states.get(id) ?? 'SENT', number: '0001', recipientViewUrl: `https://sandbox.example/${id}` };
    },
    async cancel(id: string) {
      log.push(`cancel:${id}`);
      if (opts.failCancel) throw new PayPalError('PayPal is down', 500);
      states.set(id, 'CANCELLED');
    },
    async recordPayment(id: string, p: { method: string; note?: string; amountCents: number; date: string }) {
      log.push(`record:${id}:${p.method}:${p.amountCents}:${p.note ?? ''}`);
      if (opts.failRecord) throw new PayPalError('PayPal is down', 500);
      states.set(id, 'MARKED_AS_PAID');
    },
  } as unknown as PayPalClient;
  return { client, log, states };
}

const members3 = [
  { id: 'anna', name: 'Anna', role: 'organiser', accountId: 'buyer-a' },
  { id: 'ben', name: 'Ben', role: 'member', accountId: 'buyer-b' },
  { id: 'clara', name: 'Clara', role: 'member', accountId: 'buyer-c' },
];
const david = { name: 'David', role: 'member', accountId: 'buyer-d' }; // a new member has no id yet
const family = (members: unknown[], splitRule: unknown = { type: 'equal' }, name = 'The Rowan family') => ({ name, members, splitRule });
const put = (a: App, body: unknown, who = 'anna', visitor = VISITOR) => a.inject({ method: 'PUT', url: `/api/family?as=${who}`, headers: as(visitor), payload: body as never });

describe('editing the family', () => {
  it('lets the organiser rename people, add a fourth member and rename the family', async () => {
    const a = await app();
    const res = await put(a, family([{ ...members3[0], name: 'Anne' }, members3[1], members3[2], david], { type: 'equal' }, 'The Marin family'));
    expect(res.statusCode).toBe(200);
    const saved = res.json() as FamilyView;
    expect(saved.name).toBe('The Marin family');
    expect(saved.members.map((m) => m.name)).toEqual(['Anne', 'Ben', 'Clara', 'David']);
    expect(saved.members[3].id).toMatch(/^m-[0-9a-f]{8}$/);
    expect(saved.members[3].accountId).toBe('buyer-d');
    expect(((await get(a, '/api/family')).json() as FamilyView).members).toHaveLength(4);
    // the new member can be viewed as, and has nothing to pay yet
    const asDavid = await get(a, `/api/receipts?as=${saved.members[3].id}`);
    expect(asDavid.statusCode).toBe(200);
    expect(asDavid.json()).toEqual([]);
  });

  it('keeps one visitor\'s changes away from the others', async () => {
    const a = await app();
    await put(a, family([members3[0], members3[1]]));
    expect(((await get(a, '/api/family')).json() as FamilyView).members).toHaveLength(2);
    expect(((await get(a, '/api/family', OTHER)).json() as FamilyView).members).toHaveLength(3);
  });

  it('only lets the organiser change it', async () => {
    expect((await put(await app(), family(members3), 'ben')).statusCode).toBe(403);
  });

  it('refuses anything outside 2 to 4 members, one organiser, distinct names and sandbox accounts', async () => {
    const a = await app();
    const bad = async (body: unknown, message: RegExp) => {
      const res = await put(a, body);
      expect(res.statusCode, JSON.stringify(res.json())).toBe(400);
      expect(res.json().error).toMatch(message);
    };
    await bad(family([members3[0]]), /2 to 4 members/);
    await bad(family([...members3, david, { name: 'Eve', role: 'member', accountId: 'buyer-a' }]), /2 to 4 members/);
    await bad(family([members3[0], { ...members3[1], role: 'organiser' }]), /Exactly one/);
    await bad(family([{ ...members3[0], role: 'member' }, members3[1]]), /Exactly one/);
    await bad(family([members3[0], { ...members3[1], name: 'ANNA' }]), /different name/);
    await bad(family([members3[0], { ...members3[1], accountId: 'buyer-a' }]), /different PayPal sandbox account/);
    await bad(family([members3[0], { ...members3[1], accountId: 'someone@real-person.com' }]), /sandbox account from the list/);
    await bad(family([members3[0], { ...members3[1], id: 'not-a-member' }]), /Unknown family member/);
    await bad(family([members3[0], { ...members3[1], name: '' }]), /Each name/);
    await bad(family([members3[0], { ...members3[1], name: '<img src=x onerror=alert(1)>' }]), /Each name/);
    await bad(family([members3[0], { ...members3[1], name: 'x'.repeat(21) }]), /Each name/);
    await bad(family(members3, { type: 'equal' }, ''), /family name/);
    await bad(family([members3[0], members3[0]]), /appears twice/);
    await bad({ name: 'Rowan' }, /2 to 4 members/);
  });

  it('keeps a percentage rule in step with the members', async () => {
    const a = await app();
    const pct = (bp: Record<string, number>) => ({ type: 'percent', basisPoints: bp });
    // adding David without giving him a percentage is refused...
    const missing = await put(a, family([...members3, david], pct({ anna: 5000, ben: 3000, clara: 2000 })));
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toMatch(/percentage for each person/);
    // ...a rule that does not add up is refused with the actual total...
    const off = await put(a, family(members3, pct({ anna: 5000, ben: 3000, clara: 1500 })));
    expect(off.json().error).toMatch(/add up to 95%/);
    // ...and a new member is named in the rule by position: new-<index in the members list>
    const ok = await put(a, family([...members3, david], pct({ anna: 4000, ben: 2000, clara: 2000, 'new-3': 2000 })));
    expect(ok.statusCode).toBe(200);
    const saved = ok.json() as FamilyView;
    const davidId = saved.members[3].id;
    expect(saved.splitRule).toEqual(pct({ anna: 4000, ben: 2000, clara: 2000, [davidId]: 2000 }));
  });

  it('leaves old receipts readable after a member is renamed or removed', async () => {
    const a = await app();
    await put(a, family([members3[0], { ...members3[1], name: 'Benny' }])); // Clara removed, Ben renamed
    const receipt = (await get(a, '/api/receipts/sample-green-leaf?as=anna')).json() as ReceiptView;
    expect(receipt.shares.map((s) => s.name)).toEqual(['Ben', 'Clara']); // the names they had when the receipt was made
    expect(receipt.shares).toHaveLength(2);
  });
});

describe('care credit', () => {
  const credit = (caregiverId: string, basisPoints: number) => ({ caregiverId, basisPoints });
  const withCredit = (c: unknown, rule: unknown = { type: 'equal' }, members: unknown[] = members3) => ({ ...family(members, rule), careCredit: c });

  it('is saved with the family and shown back, and only the organiser can set it', async () => {
    const a = await app();
    expect(((await get(a, '/api/family')).json() as FamilyView).careCredit).toBeNull();
    const saved = await put(a, withCredit(credit('ben', 2500)));
    expect(saved.statusCode).toBe(200);
    expect((saved.json() as FamilyView).careCredit).toEqual(credit('ben', 2500));
    expect(((await get(a, '/api/family')).json() as FamilyView).careCredit).toEqual(credit('ben', 2500));
    expect((await put(a, withCredit(credit('ben', 2500)), 'ben')).statusCode).toBe(403);
    // saving the family again without a credit removes it
    expect(((await put(a, family(members3))).json() as FamilyView).careCredit).toBeNull();
  });

  it('refuses an unknown caregiver, a removed caregiver and a credit outside 0 to 100 percent', async () => {
    const a = await app();
    for (const bad of [credit('zoe', 2500), credit('ben', -1), credit('ben', 10001), credit('ben', 12.5), { caregiverId: 'ben' }, 'ben']) {
      expect((await put(a, withCredit(bad))).statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect((await put(a, withCredit(credit('clara', 2500), { type: 'equal' }, [members3[0], members3[1]]))).statusCode).toBe(400); // Clara is no longer in the family
  });

  it('can name a person who is being added in the same save', async () => {
    const a = await app();
    const res = await put(a, withCredit(credit('new-3', 3000), { type: 'equal' }, [...members3, david]));
    expect(res.statusCode).toBe(200);
    const saved = res.json() as FamilyView;
    expect(saved.careCredit).toEqual(credit(saved.members[3].id, 3000));
    expect(saved.members[3].name).toBe('David');
  });

  it('lowers the caregiver\'s share, raises the others\', keeps the total, and records the credit', async () => {
    const a = await app();
    await put(a, withCredit(credit('ben', 2500)));
    const res = await post(a, '/api/receipts?as=anna', newReceipt);
    expect(res.statusCode).toBe(201);
    const view = res.json() as ReceiptView;
    expect(view.shares.map((s) => [s.name, s.amountCents])).toEqual([['Ben', 1167], ['Clara', 1750]]);
    expect(view.payerShareCents).toBe(1751);
    expect(1167 + 1750 + 1751).toBe(4668);
    expect(view.careCredit).toEqual({ caregiverId: 'ben', caregiverName: 'Ben', basisPoints: 2500, creditCents: 389 });
    expect(view.splitRule).toEqual({ type: 'percent', basisPoints: { anna: 3750, ben: 2500, clara: 3750 } });
  });

  it('can be switched off for one receipt', async () => {
    const a = await app();
    await put(a, withCredit(credit('ben', 2500)));
    const view = (await post(a, '/api/receipts?as=anna', { ...newReceipt, applyCareCredit: false })).json() as ReceiptView;
    expect(view.shares.map((s) => s.amountCents)).toEqual([1556, 1556]);
    expect(view.careCredit).toBeUndefined();
    expect(view.splitRule).toEqual({ type: 'equal' });
    expect((await post(a, '/api/receipts?as=anna', { ...newReceipt, applyCareCredit: 'no' })).statusCode).toBe(400);
  });

  it('is applied on top of a percentage split, and only the caregiver and the organiser see it', async () => {
    const a = await app();
    await put(a, withCredit(credit('clara', 5000), { type: 'percent', basisPoints: { anna: 5000, ben: 3000, clara: 2000 } }));
    const view = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
    expect(view.shares.map((s) => [s.name, s.amountCents])).toEqual([['Ben', 1575], ['Clara', 466]]);
    expect(view.payerShareCents).toBe(2627);
    expect(view.careCredit?.creditCents).toBe(467); // Clara's normal share at 20 % was 933
    const asClara = (await get(a, `/api/receipts/${view.id}?as=clara`)).json() as ReceiptView;
    expect(asClara.careCredit).toMatchObject({ caregiverId: 'clara', creditCents: 467 });
    expect(asClara.splitRule).toBeUndefined();
    const asBen = (await get(a, `/api/receipts/${view.id}?as=ben`)).json() as ReceiptView;
    expect(asBen.careCredit).toBeUndefined();
    expect(JSON.stringify(asBen)).not.toMatch(/467|Clara|care/i);
  });

  it('works when the organiser is the caregiver: the others pay more, nobody gets a discount line', async () => {
    const pp = fakePayPal();
    const a = await app({ paypal: pp.client });
    await put(a, withCredit(credit('anna', 4000)));
    const view = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
    expect(view.shares.every((s) => s.amountCents > 1556)).toBe(true);
    expect(view.careCredit?.caregiverName).toBe('Anna');
    expect(view.shares.reduce((s, x) => s + x.amountCents, 0) + (view.payerShareCents ?? 0)).toBe(4668);
    await post(a, `/api/receipts/${view.id}/send?as=anna`);
    expect(pp.log.filter((l) => l.startsWith('discount:')).every((l) => l.endsWith(':0'))).toBe(true);
  });

  it('puts the credit on the caregiver\'s PayPal invoice as an item discount, and says so on the others\'', async () => {
    const pp = fakePayPal();
    const a = await app({ paypal: pp.client });
    await put(a, withCredit(credit('ben', 2500)));
    const view = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
    const sent = (await post(a, `/api/receipts/${view.id}/send?as=anna`)).json() as { receipt: ReceiptView; failed: unknown[] };
    expect(sent.failed).toEqual([]);
    // Ben's item is his normal 15.56 with a 3.89 discount, so he owes 11.67; Clara's is a plain 17.50
    expect(pp.log.filter((l) => l.startsWith('create:'))).toEqual([
      'create:Ben:1556:sb-cxgha53183684@personal.example.com',
      'create:Clara:1750:sb-r1goj53183689@personal.example.com',
    ]);
    expect(pp.log.filter((l) => l.startsWith('discount:'))).toEqual(['discount:Ben:389', 'discount:Clara:0']);
    const [benText, claraText] = pp.log.filter((l) => l.startsWith('description:'));
    expect(benText).toContain('your normal share minus a $3.89 care credit for time spent helping');
    expect(claraText).toContain("which includes the family's care credit");
    expect(sent.receipt.shares.map((s) => s.status)).toEqual(['SENT', 'SENT']);
  });

  it('gives a 100 % credit no invoice at all, and still records it', async () => {
    const pp = fakePayPal();
    const a = await app({ paypal: pp.client });
    await put(a, withCredit(credit('ben', 10000)));
    const view = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
    expect(view.shares.map((s) => s.name)).toEqual(['Clara']);
    expect(view.careCredit?.creditCents).toBe(1556);
    await post(a, `/api/receipts/${view.id}/send?as=anna`);
    expect(pp.log.filter((l) => l.startsWith('create:')).map((l) => l.split(':')[1])).toEqual(['Clara']);
  });

  it('never sends an invoice whose total is not the share (PayPal ignoring the discount)', async () => {
    const pp = fakePayPal({ ignoreDiscount: true });
    const a = await app({ paypal: pp.client });
    await put(a, withCredit(credit('ben', 2500)));
    const view = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
    const res = (await post(a, `/api/receipts/${view.id}/send?as=anna`)).json() as { receipt: ReceiptView; failed: { memberId: string; message: string }[] };
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0]).toMatchObject({ memberId: 'ben' });
    expect(res.failed[0].message).toMatch(/\$15\.56 instead of \$11\.67, so it was not sent/);
    expect(res.receipt.shares.map((s) => s.status)).toEqual(['DRAFT', 'SENT']); // Ben's was held back, Clara's went out
    expect(pp.log.filter((l) => l.startsWith('send:'))).toEqual(['send:INV-2']);
  });
});

describe('splitting by percentage', () => {
  const rule = (anna: number, ben: number, clara: number) => ({ type: 'percent', basisPoints: { anna, ben, clara } });

  it('uses the percentages, gives the organiser the odd cents, and remembers the rule', async () => {
    const { client, log } = fakePayPal();
    const a = await app({ paypal: client });
    const res = await post(a, '/api/receipts?as=anna', { ...newReceipt, splitRule: rule(5000, 3000, 2000) });
    expect(res.statusCode).toBe(201);
    const view = res.json() as ReceiptView;
    expect(view.payerShareCents).toBe(2335);
    expect(view.shares.map((s) => [s.name, s.amountCents])).toEqual([['Ben', 1400], ['Clara', 933]]);
    expect(view.splitRule).toEqual(rule(5000, 3000, 2000));
    // a sibling never sees the rule or anyone else's amount
    const ben = (await get(a, `/api/receipts/${view.id}?as=ben`)).json() as ReceiptView;
    expect(ben.splitRule).toBeUndefined();
    expect(JSON.stringify(ben)).not.toContain('933');
    // the invoice says which part of the total is theirs
    await post(a, `/api/receipts/${view.id}/send?as=anna`);
    expect(log.filter((l) => l.startsWith('description:'))[0]).toContain('your part is 30% of the total');
    expect(log.filter((l) => l.startsWith('description:'))[1]).toContain('your part is 20% of the total');
  });

  it('sends no invoice to someone at 0 percent', async () => {
    const { client, log } = fakePayPal();
    const a = await app({ paypal: client });
    const view = (await post(a, '/api/receipts?as=anna', { ...newReceipt, splitRule: rule(5000, 0, 5000) })).json() as ReceiptView;
    expect(view.shares.map((s) => s.name)).toEqual(['Clara']);
    await post(a, `/api/receipts/${view.id}/send?as=anna`);
    expect(log.filter((l) => l.startsWith('create:')).map((l) => l.split(':')[1])).toEqual(['Clara']);
    expect(((await get(a, '/api/receipts?as=ben')).json() as ReceiptView[]).some((r) => r.id === view.id)).toBe(false);
  });

  it('refuses a rule that does not add up, or that leaves nothing to invoice', async () => {
    const a = await app();
    const off = await post(a, '/api/receipts?as=anna', { ...newReceipt, splitRule: rule(5000, 3000, 1000) });
    expect(off.statusCode).toBe(400);
    expect(off.json().error).toMatch(/add up to 90%/);
    const alone = await post(a, '/api/receipts?as=anna', { ...newReceipt, splitRule: rule(10000, 0, 0) });
    expect(alone.statusCode).toBe(400);
    expect(alone.json().error).toMatch(/nobody else owes anything/);
    expect(((await get(a, '/api/receipts?as=anna')).json() as ReceiptView[]).length).toBe(3); // nothing was saved
  });

  it('follows the family default when a receipt does not choose', async () => {
    const a = await app();
    await put(a, family(members3, rule(5000, 2500, 2500)));
    const view = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
    expect(view.shares.map((s) => s.amountCents)).toEqual([1167, 1167]);
    expect(view.payerShareCents).toBe(2334);
    // a receipt can still override it
    const equal = (await post(a, '/api/receipts?as=anna', { ...newReceipt, splitRule: { type: 'equal' } })).json() as ReceiptView;
    expect(equal.shares.map((s) => s.amountCents)).toEqual([1556, 1556]);
  });
});

/** A saved receipt whose two invoices (Ben, Clara) have been sent, on an app wired to `paypal`. */
async function sentReceipt(paypal: ReturnType<typeof fakePayPal>, options: Partial<AppOptions> = {}) {
  const a = await app({ paypal: paypal.client, ...options });
  const saved = (await post(a, '/api/receipts?as=anna', newReceipt)).json() as ReceiptView;
  await post(a, `/api/receipts/${saved.id}/send?as=anna`);
  return { a, id: saved.id };
}
const shareOf = (r: ReceiptView, who: string) => r.shares.find((s) => s.memberId === who)!;

describe('cancelling an invoice', () => {
  it('withdraws one sent invoice and leaves the other alone', async () => {
    const pp = fakePayPal();
    const { a, id } = await sentReceipt(pp);
    const res = await post(a, `/api/receipts/${id}/shares/clara/cancel?as=anna`);
    expect(res.statusCode).toBe(200);
    const { receipt } = res.json() as { receipt: ReceiptView };
    expect(shareOf(receipt, 'clara').status).toBe('CANCELLED');
    expect(shareOf(receipt, 'ben').status).toBe('SENT');
    expect(pp.log.filter((l) => l.startsWith('cancel:'))).toEqual(['cancel:INV-2']); // Clara's invoice only
    // the cancelled share no longer shows up as owed
    const clara = (await get(a, `/api/receipts/${id}?as=clara`)).json() as ReceiptView;
    expect(clara.shares[0].status).toBe('CANCELLED');
  });

  it('refuses when the invoice was paid in the meantime, and brings the receipt up to date', async () => {
    const pp = fakePayPal();
    const { a, id } = await sentReceipt(pp);
    pp.states.set('INV-1', 'PAID'); // Ben paid on PayPal a moment ago
    const res = await post(a, `/api/receipts/${id}/shares/ben/cancel?as=anna`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already been paid/);
    expect(pp.log.some((l) => l.startsWith('cancel:'))).toBe(false); // never tried to cancel a paid invoice
    expect(shareOf((await get(a, `/api/receipts/${id}?as=anna`)).json() as ReceiptView, 'ben').status).toBe('PAID');
  });

  it('refuses an invoice that was never sent, or is already cancelled', async () => {
    const pp = fakePayPal({ failSendFor: 'INV-1' });
    const { a, id } = await sentReceipt(pp);
    expect((await post(a, `/api/receipts/${id}/shares/ben/cancel?as=anna`)).statusCode).toBe(409); // Ben's send failed: still a draft
    expect((await post(a, `/api/receipts/${id}/shares/clara/cancel?as=anna`)).statusCode).toBe(200);
    expect((await post(a, `/api/receipts/${id}/shares/clara/cancel?as=anna`)).statusCode).toBe(409);
  });

  it('leaves the share untouched when PayPal fails', async () => {
    const pp = fakePayPal({ failCancel: true });
    const { a, id } = await sentReceipt(pp);
    const res = await post(a, `/api/receipts/${id}/shares/ben/cancel?as=anna`);
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/Nothing was changed/);
    expect(shareOf((await get(a, `/api/receipts/${id}?as=anna`)).json() as ReceiptView, 'ben').status).toBe('SENT');
  });

  it('is for the organiser, real receipts and known people only', async () => {
    const pp = fakePayPal();
    const { a, id } = await sentReceipt(pp);
    expect((await post(a, `/api/receipts/${id}/shares/clara/cancel?as=ben`)).statusCode).toBe(403);
    expect((await post(a, `/api/receipts/${id}/shares/anna/cancel?as=anna`)).statusCode).toBe(404); // the organiser has no invoice
    expect((await post(a, `/api/receipts/${id}/shares/zoe/cancel?as=anna`)).statusCode).toBe(404);
    expect((await post(a, '/api/receipts/nope/shares/ben/cancel?as=anna')).statusCode).toBe(404);
    expect((await post(a, '/api/receipts/sample-green-leaf/shares/clara/cancel?as=anna')).statusCode).toBe(400);
    expect((await post(a, `/api/receipts/${id}/shares/ben/cancel?as=anna`, undefined, OTHER)).statusCode).toBe(404); // someone else's family
    expect((await post(await app(), `/api/receipts/${id}/shares/ben/cancel?as=anna`)).statusCode).toBe(503);
  });
});

describe('marking a share as paid outside PayPal', () => {
  it('records the payment in PayPal and on the receipt', async () => {
    const pp = fakePayPal();
    const { a, id } = await sentReceipt(pp);
    const res = await post(a, `/api/receipts/${id}/shares/ben/mark-paid?as=anna`, { method: 'CASH', note: 'Paid at lunch' });
    expect(res.statusCode).toBe(200);
    const { receipt } = res.json() as { receipt: ReceiptView };
    expect(shareOf(receipt, 'ben')).toMatchObject({ status: 'PAID', paidOutside: { method: 'CASH', note: 'Paid at lunch' } });
    expect(shareOf(receipt, 'clara').status).toBe('SENT');
    expect(pp.log.filter((l) => l.startsWith('record:'))).toEqual(['record:INV-1:CASH:1556:Paid at lunch']);
    // a later "Refresh status" keeps it paid, and Ben sees how it was paid but not the private note
    await post(a, `/api/receipts/${id}/refresh?as=anna`);
    const asBen = (await get(a, `/api/receipts/${id}?as=ben`)).json() as ReceiptView;
    expect(asBen.shares[0]).toMatchObject({ status: 'PAID', paidOutside: { method: 'CASH' } });
    expect(JSON.stringify(asBen)).not.toContain('Paid at lunch');
  });

  it('works without a note, and for a bank transfer', async () => {
    const pp = fakePayPal();
    const { a, id } = await sentReceipt(pp);
    const res = await post(a, `/api/receipts/${id}/shares/clara/mark-paid?as=anna`, { method: 'BANK_TRANSFER' });
    expect(shareOf((res.json() as { receipt: ReceiptView }).receipt, 'clara').paidOutside).toEqual({ method: 'BANK_TRANSFER' });
  });

  it('refuses a bad method or note, and anything not open', async () => {
    const pp = fakePayPal();
    const { a, id } = await sentReceipt(pp);
    const url = `/api/receipts/${id}/shares/ben/mark-paid?as=anna`;
    expect((await post(a, url, { method: 'BITCOIN' })).statusCode).toBe(400);
    expect((await post(a, url, {})).statusCode).toBe(400);
    expect((await post(a, url, { method: 'CASH', note: 'x'.repeat(101) })).statusCode).toBe(400);
    expect((await post(a, url, { method: 'CASH', note: 'line\nbreak' })).statusCode).toBe(400);
    expect(pp.log.some((l) => l.startsWith('record:'))).toBe(false);
    pp.states.set('INV-1', 'PAID');
    const paid = await post(a, url, { method: 'CASH' });
    expect(paid.statusCode).toBe(409);
    expect(paid.json().error).toMatch(/already been paid/);
    expect(pp.log.some((l) => l.startsWith('record:'))).toBe(false); // never records a second payment
    await post(a, `/api/receipts/${id}/shares/clara/cancel?as=anna`);
    expect((await post(a, `/api/receipts/${id}/shares/clara/mark-paid?as=anna`, { method: 'CASH' })).statusCode).toBe(409); // cancelled
  });

  it('leaves the share untouched when PayPal fails', async () => {
    const pp = fakePayPal({ failRecord: true });
    const { a, id } = await sentReceipt(pp);
    const res = await post(a, `/api/receipts/${id}/shares/ben/mark-paid?as=anna`, { method: 'CASH' });
    expect(res.statusCode).toBe(502);
    expect(shareOf((await get(a, `/api/receipts/${id}?as=anna`)).json() as ReceiptView, 'ben').status).toBe('SENT');
  });

  it('is for the organiser and real receipts only, and respects the PayPal limit', async () => {
    const pp = fakePayPal();
    const { a, id } = await sentReceipt(pp);
    expect((await post(a, `/api/receipts/${id}/shares/clara/mark-paid?as=ben`, { method: 'CASH' })).statusCode).toBe(403);
    expect((await post(a, '/api/receipts/sample-green-leaf/shares/clara/mark-paid?as=anna', { method: 'CASH' })).statusCode).toBe(400);
    const limited = await sentReceipt(fakePayPal(), { paypalLimiter: (() => { let calls = 0; return () => (++calls <= 1 ? { ok: true as const } : { ok: false as const, reason: 'rate' as const }); })() });
    expect((await post(limited.a, `/api/receipts/${limited.id}/shares/ben/mark-paid?as=anna`, { method: 'CASH' })).statusCode).toBe(429);
  });
});

describe('saving and sending receipts', () => {
  it('saves a receipt with an equal split and nothing sent yet', async () => {
    const a = await app();
    const res = await post(a, '/api/receipts?as=anna', newReceipt);
    expect(res.statusCode).toBe(201);
    const view = res.json() as ReceiptView;
    expect(view.totalCents).toBe(4668);
    expect(view.payerShareCents).toBe(1556);
    expect(view.shares).toEqual([
      { memberId: 'ben', name: 'Ben', amountCents: 1556, status: 'DRAFT' },
      { memberId: 'clara', name: 'Clara', amountCents: 1556, status: 'DRAFT' },
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
