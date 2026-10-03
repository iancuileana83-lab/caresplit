import { ArrowLeft, Info } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { formatUsd, splitEqual } from '../../../shared/money';
import { Card } from '../components/Card';
import { Steps } from '../components/Steps';
import type { ConfirmedReceipt } from '../lib/draft';
import { formatLongDate } from '../lib/receipts';
import { useViewAs } from '../lib/view-as';

/** Step 3, first half: shows the equal split of the confirmed receipt. Sending invoices comes next. */
export function SplitPreview() {
  const { family, viewer } = useViewAs();
  const receipt = (useLocation().state as { receipt?: ConfirmedReceipt } | null)?.receipt;
  if (!receipt || viewer.role !== 'organiser') return <Navigate to="/add" replace />;

  const parts = splitEqual(receipt.totalCents, family.members.map((m) => m.id), viewer.id);
  const nameOf = (id: string) => family.members.find((m) => m.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <Link to="/add" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-teal-700">
        <ArrowLeft size={18} aria-hidden="true" />
        Back to the photo
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Split & send</h1>
        <p className="mt-0.5 text-quiet">
          {receipt.merchant} · {formatLongDate(receipt.date)}
        </p>
      </div>
      <Steps current={3} />

      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-quiet">Total, paid by {viewer.name}</span>
          <span className="text-xl font-semibold tabular-nums">{formatUsd(receipt.totalCents)}</span>
        </div>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Equal shares</h2>
        <Card className="py-1">
          <ul className="divide-y divide-line">
            {parts.map((p) => (
              <li key={p.memberId} className="flex items-center justify-between py-3">
                <span>
                  <span className="block font-medium">{nameOf(p.memberId)}</span>
                  <span className="block text-xs text-quiet">{p.memberId === viewer.id ? 'Your own share, not invoiced' : 'Will get a PayPal invoice'}</span>
                </span>
                <span className="font-medium tabular-nums">{formatUsd(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Card>
        <div className="flex items-start gap-3 py-1">
          <Info size={20} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
          <p className="text-sm text-quiet">Sending the PayPal invoices comes in the next step. Odd cents stay with the organiser.</p>
        </div>
      </Card>
    </div>
  );
}
