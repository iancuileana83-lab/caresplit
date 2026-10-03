import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Member, ReceiptView } from '../../../shared/types';
import { formatDate, formatUsd, receiptSummary } from '../lib/receipts';
import { Card } from './Card';
import { Chip, ShareChip } from './Chip';

/** Receipts as `viewer` may see them: the organiser sees totals, a sibling sees only their share. */
export function ReceiptList({ receipts, viewer, empty }: { receipts: ReceiptView[]; viewer: Member; empty?: ReactNode }) {
  if (receipts.length === 0) {
    return (
      <Card>
        {empty ?? (
          <p className="py-6 text-center text-quiet">
            {viewer.role === 'organiser' ? 'No receipts yet. Add the first one to start splitting.' : 'Nothing to pay yet. Invoices show up here when the organiser sends them.'}
          </p>
        )}
      </Card>
    );
  }
  return (
    <Card className="py-1">
      <ul className="divide-y divide-line">
        {receipts.map((r) => {
          const own = r.shares.find((s) => s.memberId === viewer.id);
          const summary = receiptSummary(r);
          return (
            <li key={r.id}>
              <Link to={`/receipts/${r.id}`} className="flex min-h-16 items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.merchant}</span>
                  <span className="block text-xs text-quiet tabular-nums">
                    {formatDate(r.date)} · {viewer.role === 'organiser' ? formatUsd(r.totalCents ?? 0) : `Your share ${formatUsd(own?.amountCents ?? 0)}`}
                    {r.sample && <span className="ml-1.5 rounded bg-stone-200 px-1.5 py-0.5 text-[11px] text-stone-700">Sample</span>}
                  </span>
                </span>
                {viewer.role === 'organiser' ? <Chip tone={summary.tone}>{summary.label}</Chip> : own && <ShareChip status={own.status} />}
              </Link>
              {viewer.role !== 'organiser' && own?.status === 'SENT' && own.invoiceUrl && (
                <a
                  href={own.invoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800"
                >
                  Open invoice
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
