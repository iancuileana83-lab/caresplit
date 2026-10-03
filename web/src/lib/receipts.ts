import { formatUsd } from '../../../shared/money';
import type { ReceiptView, Share } from '../../../shared/types';

export { formatUsd };

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const isOpen = (s: Share) => s.status === 'SENT' || s.status === 'DRAFT';

/** Totals across the shares of the given receipts. Cancelled invoices count as neither open nor paid. */
export function sumShares(receipts: ReceiptView[]) {
  let open = 0;
  let paid = 0;
  for (const r of receipts) {
    for (const s of r.shares) {
      if (s.status === 'PAID') paid += s.amountCents;
      else if (isOpen(s)) open += s.amountCents;
    }
  }
  return { openCents: open, paidCents: paid };
}

export function sumSpent(receipts: ReceiptView[]): number {
  return receipts.reduce((sum, r) => sum + (r.totalCents ?? 0), 0);
}

/**
 * Where a receipt stands. Looks only at the shares the viewer can see, so it works for the
 * organiser (everyone's shares) and for a sibling (their own).
 * paid: every live invoice is paid · open: some are still unpaid · unsent: none sent yet · cancelled: all cancelled.
 */
export type ReceiptGroup = 'paid' | 'open' | 'unsent' | 'cancelled';

export function receiptGroup(r: ReceiptView): ReceiptGroup {
  const live = r.shares.filter((s) => s.status !== 'CANCELLED');
  if (r.shares.length > 0 && live.length === 0) return 'cancelled';
  if (live.length > 0 && live.every((s) => s.status === 'PAID')) return 'paid';
  if (live.every((s) => s.status === 'DRAFT')) return 'unsent';
  return 'open';
}

/** Summary chip text and tone for a whole receipt, as the organiser sees it. */
export function receiptSummary(r: ReceiptView): { label: string; tone: 'paid' | 'partial' | 'none' | 'cancelled' } {
  const group = receiptGroup(r);
  const live = r.shares.filter((s) => s.status !== 'CANCELLED');
  switch (group) {
    case 'paid':
      return { label: 'Paid', tone: 'paid' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'cancelled' };
    case 'unsent':
      return { label: 'Not sent', tone: 'none' };
    default:
      return { label: `${live.filter((s) => s.status === 'PAID').length} of ${live.length} paid`, tone: 'partial' };
  }
}
