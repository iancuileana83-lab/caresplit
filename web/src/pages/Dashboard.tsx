import { Camera, HeartHandshake } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatPercent } from '../../../shared/split';
import type { ReceiptView } from '../../../shared/types';
import { Card, ErrorNote, LoadingNote, Metric } from '../components/Card';
import { ReceiptList } from '../components/ReceiptList';
import { useApi } from '../lib/api';
import { careCreditTotals, formatUsd, sumShares, sumSpent } from '../lib/receipts';
import { useViewAs } from '../lib/view-as';

export function Dashboard() {
  const { family, viewer } = useViewAs();
  const state = useApi<ReceiptView[]>(`/api/receipts?as=${viewer.id}`);
  if (state.status === 'loading') return <LoadingNote />;
  if (state.status === 'error') return <ErrorNote message={state.message} onRetry={state.retry} />;

  const receipts = state.data;
  const careTotals = careCreditTotals(receipts);
  const { openCents, paidCents } = sumShares(receipts);
  const organiser = viewer.role === 'organiser';

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Hi {viewer.name}</h1>
        <p className="mt-0.5 text-quiet">{organiser ? "You're the organiser." : 'Here is your part of the pharmacy costs.'}</p>
      </section>

      <section aria-label="Summary" className={`grid gap-2 ${organiser ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {organiser ? (
          <>
            <Metric label="Spent" value={formatUsd(sumSpent(receipts))} />
            <Metric label="Open shares" value={formatUsd(openCents)} tone="amber" />
            <Metric label="Paid back" value={formatUsd(paidCents)} tone="green" />
          </>
        ) : (
          <>
            <Metric label="To pay" value={formatUsd(openCents)} tone="amber" />
            <Metric label="Paid" value={formatUsd(paidCents)} tone="green" />
          </>
        )}
      </section>

      {(careTotals.length > 0 || (organiser && family.careCredit)) && (
        <section aria-label="Care credit">
          <Card className="space-y-1.5">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <HeartHandshake size={16} className="text-teal-700" aria-hidden="true" />
              Care credit
            </h2>
            {organiser && family.careCredit && (
              <p className="text-sm text-quiet">
                On for {family.members.find((m) => m.id === family.careCredit?.caregiverId)?.name ?? 'the main caregiver'} at {formatPercent(family.careCredit.basisPoints)}%. It is applied to new receipts unless you switch it off for one.
              </p>
            )}
            {careTotals.length > 0 ? (
              <ul className="text-sm">
                {careTotals.map((t) => (
                  <li key={t.caregiverId}>
                    {organiser ? `${t.name}: ` : 'So far: '}
                    <span className="font-medium tabular-nums">{formatUsd(t.creditCents)}</span> across {t.receipts} receipt{t.receipts === 1 ? '' : 's'}
                    {!organiser && '. Thank you for the time you give.'}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-quiet">No care credit has been applied yet.</p>
            )}
          </Card>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">{organiser ? 'Recent receipts' : 'Your shares'}</h2>
          {receipts.length > 0 && (
            <Link to="/receipts" className="text-sm text-teal-700 underline-offset-2 hover:underline">
              See all
            </Link>
          )}
        </div>
        <ReceiptList receipts={receipts.slice(0, 3)} viewer={viewer} />
      </section>

      {organiser && (
        <Link
          to="/add"
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 text-[15px] font-medium text-white hover:bg-teal-800"
        >
          <Camera size={20} aria-hidden="true" />
          Add receipt
        </Link>
      )}
    </div>
  );
}
