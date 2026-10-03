import type { Member, ReceiptView } from '../shared/types';
import type { StoredReceipt } from './store';

/** The full record, as the organiser sees it. */
export function organiserView(r: StoredReceipt): ReceiptView {
  return {
    id: r.id,
    merchant: r.merchant,
    date: r.date,
    payerId: r.payerId,
    totalCents: r.totalCents,
    payerShareCents: r.payerShareCents,
    shares: r.shares.map((s) => ({
      memberId: s.memberId,
      name: s.memberName,
      amountCents: s.amountCents,
      status: s.status,
      invoiceUrl: s.invoiceUrl,
      ...(s.paidOutside ? { paidOutside: { method: s.paidOutside.method, note: s.paidOutside.note } } : {}),
    })),
    splitRule: r.splitRule ?? { type: 'equal' },
    ...(r.sample ? { sample: true } : {}),
  };
}

/**
 * What `viewer` may see of one receipt. The organiser sees everything. A sibling sees only
 * their own share: no total, no one else's amount and no split rule. Undefined means "not for this viewer".
 */
export function viewOf(r: StoredReceipt, viewer: Member): ReceiptView | undefined {
  const full = organiserView(r);
  if (viewer.role === 'organiser') return full;
  // The organiser's private note about how a payment was made is not shown to the sibling.
  const own = full.shares.filter((s) => s.memberId === viewer.id).map((s) => (s.paidOutside ? { ...s, paidOutside: { method: s.paidOutside.method } } : s));
  if (own.length === 0) return undefined;
  return { id: full.id, merchant: full.merchant, date: full.date, payerId: full.payerId, shares: own, ...(full.sample ? { sample: true } : {}) };
}

export function viewsFor(receipts: StoredReceipt[], viewer: Member): ReceiptView[] {
  return receipts.flatMap((r) => viewOf(r, viewer) ?? []);
}
