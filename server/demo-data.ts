// Fictional demo family and receipts, in memory. Phase 1 replaces the receipts with Firestore
// and real PayPal invoices; the invoice links below are placeholders, not real invoices.
import { splitEqual } from '../shared/money';
import type { FamilyView, Member, MemberId, ReceiptView, Share, ShareStatus } from '../shared/types';

export const family: FamilyView = {
  name: 'The Rowan family',
  members: [
    { id: 'anna', name: 'Anna', role: 'organiser' },
    { id: 'ben', name: 'Ben', role: 'member' },
    { id: 'clara', name: 'Clara', role: 'member' },
  ],
};

const memberIds = family.members.map((m) => m.id);

interface StoredReceipt {
  id: string;
  merchant: string;
  date: string;
  totalCents: number;
  payerId: MemberId;
  statuses: Record<MemberId, ShareStatus>;
}

const stored: StoredReceipt[] = [
  { id: 'r-green-leaf', merchant: 'Green Leaf Pharmacy', date: '2026-10-02', totalCents: 3978, payerId: 'anna', statuses: { ben: 'PAID', clara: 'SENT' } },
  { id: 'r-riverside', merchant: 'Riverside Pharmacy', date: '2026-09-28', totalCents: 4449, payerId: 'anna', statuses: { ben: 'PAID', clara: 'PAID' } },
  { id: 'r-sunrise', merchant: 'Sunrise Drugstore', date: '2026-09-25', totalCents: 2638, payerId: 'anna', statuses: { ben: 'PAID', clara: 'PAID' } },
];

function invoiceUrl(receiptId: string, memberId: MemberId): string {
  return `https://www.sandbox.paypal.com/invoice/p/#demo-${receiptId}-${memberId}`;
}

/** The full record, as the organiser sees it. */
function fullView(r: StoredReceipt): ReceiptView {
  const parts = splitEqual(r.totalCents, memberIds, r.payerId);
  const shares: Share[] = parts
    .filter((p) => p.memberId !== r.payerId)
    .map((p) => ({
      memberId: p.memberId,
      amountCents: p.amountCents,
      status: r.statuses[p.memberId] ?? 'DRAFT',
      invoiceUrl: invoiceUrl(r.id, p.memberId),
    }));
  const payerShareCents = parts.find((p) => p.memberId === r.payerId)?.amountCents ?? 0;
  return { id: r.id, merchant: r.merchant, date: r.date, payerId: r.payerId, totalCents: r.totalCents, payerShareCents, shares };
}

export function findMember(id: string): Member | undefined {
  return family.members.find((m) => m.id === id);
}

/**
 * What `viewer` may see. The organiser sees everything. A sibling sees only the receipts
 * that include a share for them, and only their own share: no total and no other amounts.
 */
export function receiptsFor(viewer: Member): ReceiptView[] {
  const all = stored.map(fullView);
  if (viewer.role === 'organiser') return all;
  return all
    .map((r): ReceiptView => ({
      id: r.id,
      merchant: r.merchant,
      date: r.date,
      payerId: r.payerId,
      shares: r.shares.filter((s) => s.memberId === viewer.id),
    }))
    .filter((r) => r.shares.length > 0);
}
