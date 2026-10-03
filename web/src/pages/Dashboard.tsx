import { Camera } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReceiptView } from '../../../shared/types';
import { ErrorNote, LoadingNote, Metric } from '../components/Card';
import { ReceiptList } from '../components/ReceiptList';
import { useApi } from '../lib/api';
import { formatUsd, sumShares, sumSpent } from '../lib/receipts';
import { useViewAs } from '../lib/view-as';

export function Dashboard() {
  const { viewer } = useViewAs();
  const state = useApi<ReceiptView[]>(`/api/receipts?as=${viewer.id}`);
  if (state.status === 'loading') return <LoadingNote />;
  if (state.status === 'error') return <ErrorNote message={state.message} />;

  const receipts = state.data;
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

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">{organiser ? 'Recent receipts' : 'Your shares'}</h2>
          <Link to="/receipts" className="text-sm text-teal-700 underline-offset-2 hover:underline">
            See all
          </Link>
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
