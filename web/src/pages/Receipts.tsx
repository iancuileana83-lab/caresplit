import { FilterX } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { ReceiptView } from '../../../shared/types';
import { ErrorNote, LoadingNote, Metric } from '../components/Card';
import { ReceiptList } from '../components/ReceiptList';
import { useApi } from '../lib/api';
import { applyFilters, describeFilters, filtersToParams, isFiltered, monthsIn, parseFilters, STATUS_OPTIONS, type Filters } from '../lib/filters';
import { formatUsd, sumShares, sumSpent } from '../lib/receipts';
import { useViewAs } from '../lib/view-as';

const selectClass = 'min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base';

export function Receipts() {
  const { viewer } = useViewAs();
  const organiser = viewer.role === 'organiser';
  const state = useApi<ReceiptView[]>(`/api/receipts?as=${viewer.id}`, { pollMs: 15_000, pollWhile: (list) => list.some((r) => !r.sample && r.shares.some((s) => s.status === 'SENT')) });
  const [params, setParams] = useSearchParams();

  if (state.status === 'loading') return <Page><LoadingNote /></Page>;
  if (state.status === 'error') return <Page><ErrorNote message={state.message} onRetry={state.retry} /></Page>;

  const all = state.data;
  const months = monthsIn(all);
  const filters = parseFilters(params, months.map((m) => m.key));
  const shown = applyFilters(all, filters);
  const { openCents, paidCents } = sumShares(shown);

  const setFilters = (next: Filters) => setParams(filtersToParams(next), { replace: true });

  return (
    <Page>
      {all.length > 0 && (
        <>
          <section aria-label="Filters" className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="filter-month" className="mb-1 block text-xs text-quiet">
                Month
              </label>
              <select id="filter-month" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} className={selectClass}>
                <option value="all">All months</option>
                {months.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-status" className="mb-1 block text-xs text-quiet">
                Status
              </label>
              <select id="filter-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters['status'] })} className={selectClass}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section aria-label="Totals for this selection">
            <p className="mb-2 text-sm text-quiet">
              {describeFilters(filters)} · {shown.length} receipt{shown.length === 1 ? '' : 's'}
            </p>
            <div className={`grid gap-2 ${organiser ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {organiser ? (
                <>
                  <Metric label="Spent" value={formatUsd(sumSpent(shown))} />
                  <Metric label="Open shares" value={formatUsd(openCents)} tone="amber" />
                  <Metric label="Paid back" value={formatUsd(paidCents)} tone="green" />
                </>
              ) : (
                <>
                  <Metric label="To pay" value={formatUsd(openCents)} tone="amber" />
                  <Metric label="Paid" value={formatUsd(paidCents)} tone="green" />
                </>
              )}
            </div>
          </section>
        </>
      )}

      <ReceiptList
        receipts={shown}
        viewer={viewer}
        empty={
          all.length === 0 ? undefined : (
            <div className="space-y-2 py-4 text-center">
              <p className="text-quiet">No receipts match these filters.</p>
              {isFiltered(filters) && (
                <button
                  type="button"
                  onClick={() => setFilters({ month: 'all', status: 'all' })}
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-teal-700"
                >
                  <FilterX size={16} aria-hidden="true" />
                  Clear filters
                </button>
              )}
            </div>
          )
        }
      />

    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Receipts</h1>
      {children}
    </div>
  );
}
