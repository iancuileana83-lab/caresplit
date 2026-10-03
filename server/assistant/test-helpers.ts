// Shared set-up for the assistant tests: a family with one real receipt and a PayPal stand-in that records what it was asked.
import { newFamily } from '../demo-data';
import type { InvoiceDeps } from '../invoices';
import type { PayPalClient } from '../paypal';
import { createMemoryStore, type StoredReceipt, type StoredShare } from '../store';
import type { ActionContext } from './actions';

export const NOW = new Date('2026-10-04T10:00:00Z');
export const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

export function fakePayPal() {
  const log: string[] = [];
  const states = new Map<string, string>();
  let n = 0;
  const client = {
    async createDraft(req: { recipientName: string }) {
      const id = `INV2-FAKE-FAKE-FAKE-000${++n}`;
      states.set(id, 'DRAFT');
      log.push(`create:${req.recipientName}`);
      return { id, status: 'DRAFT' };
    },
    async send(id: string) {
      states.set(id, 'SENT');
      log.push(`send:${id}`);
    },
    async get(id: string) {
      return { id, status: states.get(id) ?? 'SENT', recipientViewUrl: `https://sandbox.example/${id}` };
    },
    async remind(id: string, r: { subject: string; note: string }) {
      log.push(`remind:${id}:${r.note}`);
    },
    async cancel(id: string) {
      states.set(id, 'CANCELLED');
      log.push(`cancel:${id}`);
    },
    async recordPayment(id: string, p: { method: string; note?: string }) {
      states.set(id, 'MARKED_AS_PAID');
      log.push(`record:${id}:${p.method}:${p.note ?? ''}`);
    },
  } as unknown as PayPalClient;
  return { client, log, states };
}

export const share = (memberId: string, memberName: string, amountCents: number, status: StoredShare['status'], invoiceId?: string): StoredShare => ({ memberId, memberName, amountCents, status, invoiceId });

/** A family with one real receipt, by default with Ben's and Clara's invoices sent. */
export async function setup(shares?: StoredShare[]) {
  const store = createMemoryStore();
  const family = newFamily('fam-1', NOW);
  await store.saveFamily(family);
  const pp = fakePayPal();
  const receipts = store.receipts(family.id);
  const receipt: StoredReceipt = {
    id: 'rcpt-1',
    merchant: 'Green Leaf Pharmacy',
    date: '2026-10-02',
    currency: 'USD',
    totalCents: 974,
    payerId: 'anna',
    payerShareCents: 325,
    items: [],
    subtotalCents: null,
    discountCents: null,
    taxCents: null,
    shares: shares ?? [share('ben', 'Ben', 324, 'SENT', 'INV2-FAKE-FAKE-FAKE-0001'), share('clara', 'Clara', 325, 'SENT', 'INV2-FAKE-FAKE-FAKE-0002')],
    createdAt: NOW.toISOString(),
    expireAt: family.expireAt,
  };
  await receipts.save(receipt);
  let clockNow = NOW;
  const ctx: ActionContext = { store, family, receipts, now: () => clockNow };
  const deps: InvoiceDeps = { store: receipts, paypal: pp.client, members: family.members.map((m) => ({ id: m.id, name: m.name, role: m.role })), emailOf: () => 'fictional@example.com' };
  return { store, family, receipts, ctx, deps, pp, setNow: (d: Date) => (clockNow = d) };
}
