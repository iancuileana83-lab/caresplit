import { describe, expect, it } from 'vitest';
import { FAMILY_TTL_DAYS, accountEmail, newFamily, sandboxAccounts, seedReceipts } from './demo-data';
import { getOrCreateFamily, resetFamily, VISITOR_ID } from './families';
import { createMemoryStore } from './store';

const NOW = new Date('2026-10-10T09:00:00Z');
const ID = '33333333-3333-4333-8333-333333333333';

describe('visitor ids', () => {
  it('accepts random UUIDs and nothing else', () => {
    expect(VISITOR_ID.test(ID)).toBe(true);
    for (const bad of ['', 'anna', '../etc/passwd', ID + 'x', ID.replace(/-/g, ''), '33333333-3333-1333-8333-333333333333']) expect(VISITOR_ID.test(bad)).toBe(false);
  });
});

describe('demo family', () => {
  it('expires after seven days, and everything in it expires with it', () => {
    const f = newFamily(ID, NOW);
    expect(new Date(f.expireAt).getTime() - NOW.getTime()).toBe(FAMILY_TTL_DAYS * 24 * 60 * 60 * 1000);
    expect(FAMILY_TTL_DAYS).toBe(7);
    for (const r of seedReceipts(f, NOW)) expect(r.expireAt).toBe(f.expireAt);
  });

  it('seeds recent, consistent sample receipts with no invoice links', () => {
    const f = newFamily(ID, NOW);
    const receipts = seedReceipts(f, NOW);
    expect(receipts.map((r) => r.date)).toEqual(['2026-10-09', '2026-10-05', '2026-10-02']);
    for (const r of receipts) {
      expect(r.sample).toBe(true);
      expect(r.payerShareCents + r.shares.reduce((s, x) => s + x.amountCents, 0)).toBe(r.totalCents);
      expect(r.shares.every((s) => s.invoiceId === undefined && s.invoiceUrl === undefined)).toBe(true);
    }
  });

  it('only uses sandbox accounts that exist, one per member', () => {
    const f = newFamily(ID, NOW);
    const accounts = f.members.map((m) => m.accountId);
    expect(new Set(accounts).size).toBe(accounts.length);
    for (const id of accounts) expect(accountEmail(id)).toMatch(/@personal\.example\.com$/);
    expect(accountEmail('nope')).toBeUndefined();
    expect(sandboxAccounts.every((a) => /^sb-[a-z0-9]+@personal\.example\.com$/.test(a.email))).toBe(true);
  });
});

describe('getOrCreateFamily and resetFamily', () => {
  it('creates and seeds once, and returns the same family afterwards', async () => {
    const store = createMemoryStore();
    const first = await getOrCreateFamily(store, ID, NOW);
    const again = await getOrCreateFamily(store, ID, new Date('2026-10-11T00:00:00Z'));
    expect(again).toEqual(first);
    expect(await store.receipts(ID).list()).toHaveLength(3);
  });

  it('reset removes added receipts, restores the family and renews the expiry', async () => {
    const store = createMemoryStore();
    await getOrCreateFamily(store, ID, NOW);
    const extra = (await store.receipts(ID).list())[0];
    await store.receipts(ID).save({ ...extra, id: 'mine', sample: undefined });
    expect(await store.receipts(ID).list()).toHaveLength(4);
    const later = new Date('2026-10-12T09:00:00Z');
    const fresh = await resetFamily(store, ID, later);
    expect(await store.receipts(ID).list()).toHaveLength(3);
    expect(await store.receipts(ID).get('mine')).toBeUndefined();
    expect(fresh.createdAt).toBe(later.toISOString());
  });
});
