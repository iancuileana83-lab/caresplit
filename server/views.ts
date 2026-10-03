import type { Member, ReceiptCareCredit, ReceiptView } from '../shared/types';
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
      ...(s.statusSource === 'webhook' && s.statusUpdatedAt ? { autoUpdatedAt: s.statusUpdatedAt } : {}),
      ...(s.reminderSentAt ? { lastReminderAt: s.reminderSentAt } : {}),
    })),
    splitRule: r.splitRule ?? { type: 'equal' },
    ...(r.careCredit ? { careCredit: careCreditView(r) } : {}),
    ...(r.sample ? { sample: true } : {}),
  };
}

function careCreditView(r: StoredReceipt): ReceiptCareCredit {
  const c = r.careCredit!;
  return { caregiverId: c.caregiverId, caregiverName: c.caregiverName, basisPoints: c.basisPoints, creditCents: c.creditCents };
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
  // The caregiver also sees their own credit (a thank-you); the other siblings do not.
  const credit = r.careCredit && r.careCredit.caregiverId === viewer.id ? { careCredit: careCreditView(r) } : {};
  return { id: full.id, merchant: full.merchant, date: full.date, payerId: full.payerId, shares: own, ...credit, ...(full.sample ? { sample: true } : {}) };
}

export function viewsFor(receipts: StoredReceipt[], viewer: Member): ReceiptView[] {
  return receipts.flatMap((r) => viewOf(r, viewer) ?? []);
}
