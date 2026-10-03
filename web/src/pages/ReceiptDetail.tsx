import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { ReceiptView } from '../../../shared/types';
import { Card, ErrorNote, LoadingNote } from '../components/Card';
import { ShareChip } from '../components/Chip';
import { useApi } from '../lib/api';
import { formatLongDate, formatUsd } from '../lib/receipts';
import { useViewAs } from '../lib/view-as';

export function ReceiptDetail() {
  const { id = '' } = useParams();
  const { family, viewer } = useViewAs();
  const state = useApi<ReceiptView>(`/api/receipts/${encodeURIComponent(id)}?as=${viewer.id}`);
  const nameOf = (memberId: string) => family.members.find((m) => m.id === memberId)?.name ?? memberId;

  return (
    <div className="space-y-4">
      <Link to="/receipts" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-teal-700">
        <ArrowLeft size={18} aria-hidden="true" />
        Receipts
      </Link>

      {state.status === 'loading' && <LoadingNote />}
      {state.status === 'error' && <ErrorNote message="We couldn't find that receipt" />}
      {state.status === 'ready' && (
        <>
          <section>
            <h1 className="text-2xl font-semibold tracking-tight">{state.data.merchant}</h1>
            <p className="mt-0.5 text-quiet">
              {formatLongDate(state.data.date)} · paid at the pharmacy by {nameOf(state.data.payerId)}
            </p>
          </section>

          {state.data.totalCents !== undefined && (
            <Card>
              <div className="flex items-baseline justify-between">
                <span className="text-quiet">Total</span>
                <span className="text-xl font-semibold tabular-nums">{formatUsd(state.data.totalCents)}</span>
              </div>
            </Card>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold">{viewer.role === 'organiser' ? 'Who owes what' : 'Your share'}</h2>
            <Card className="py-1">
              <ul className="divide-y divide-line">
                {state.data.shares.map((s) => (
                  <li key={s.memberId} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{nameOf(s.memberId)}</div>
                        <div className="text-sm tabular-nums text-quiet">{formatUsd(s.amountCents)}</div>
                      </div>
                      <ShareChip status={s.status} />
                    </div>
                    {s.status === 'SENT' && s.invoiceUrl && (
                      <a
                        href={s.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-teal-700 underline-offset-2 hover:underline"
                      >
                        {viewer.id === s.memberId ? 'Open your invoice' : 'View invoice'}
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    )}
                  </li>
                ))}
                {state.data.payerShareCents !== undefined && (
                  <li className="flex items-center justify-between py-3 text-quiet">
                    <span>
                      {nameOf(state.data.payerId)}'s own share
                      <span className="block text-xs">Not invoiced</span>
                    </span>
                    <span className="tabular-nums">{formatUsd(state.data.payerShareCents)}</span>
                  </li>
                )}
              </ul>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
