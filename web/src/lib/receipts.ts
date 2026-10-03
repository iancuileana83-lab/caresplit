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

/** Totals across the shares of the given receipts. */
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

/** Summary chip text and tone for a whole receipt, as the organiser sees it. */
export function receiptSummary(r: ReceiptView): { label: string; tone: 'paid' | 'partial' | 'none' } {
  const live = r.shares.filter((s) => s.status !== 'CANCELLED');
  const paid = live.filter((s) => s.status === 'PAID').length;
  if (live.length > 0 && paid === live.length) return { label: 'Paid', tone: 'paid' };
  if (live.every((s) => s.status === 'DRAFT')) return { label: 'Not sent', tone: 'none' };
  return { label: `${paid} of ${live.length} paid`, tone: 'partial' };
}
