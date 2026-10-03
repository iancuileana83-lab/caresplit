import type { ReceiptView } from '../../../shared/types';
import { receiptGroup, type ReceiptGroup } from './receipts';

export type StatusFilter = 'all' | ReceiptGroup;

export interface Filters {
  /** 'all' or a month like '2026-10' */
  month: string;
  status: StatusFilter;
}

export const NO_FILTERS: Filters = { month: 'all', status: 'all' };

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Waiting for payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'unsent', label: 'Not sent' },
  { value: 'cancelled', label: 'Cancelled' },
];

const monthOf = (iso: string) => iso.slice(0, 7);

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** The months that have receipts, newest first. */
export function monthsIn(receipts: ReceiptView[]): { key: string; label: string }[] {
  const keys = [...new Set(receipts.map((r) => monthOf(r.date)))].sort().reverse();
  return keys.map((key) => ({ key, label: monthLabel(key) }));
}

export function applyFilters(receipts: ReceiptView[], filters: Filters): ReceiptView[] {
  return receipts.filter((r) => (filters.month === 'all' || monthOf(r.date) === filters.month) && (filters.status === 'all' || receiptGroup(r) === filters.status));
}

export function isFiltered(f: Filters): boolean {
  return f.month !== NO_FILTERS.month || f.status !== NO_FILTERS.status;
}

/** Reads the filters from the address bar, ignoring anything that is not a real choice. */
export function parseFilters(params: URLSearchParams, monthKeys: string[]): Filters {
  const month = params.get('month') ?? 'all';
  const status = params.get('status') ?? 'all';
  return {
    month: month === 'all' || monthKeys.includes(month) ? month : 'all',
    status: STATUS_OPTIONS.some((o) => o.value === status) ? (status as StatusFilter) : 'all',
  };
}

/** The address-bar form of the filters; the defaults leave no trace. */
export function filtersToParams(f: Filters): Record<string, string> {
  return { ...(f.month !== 'all' ? { month: f.month } : {}), ...(f.status !== 'all' ? { status: f.status } : {}) };
}

/** A short description of the selection, for the totals card. */
export function describeFilters(f: Filters): string {
  const parts = [f.month === 'all' ? 'All months' : monthLabel(f.month)];
  if (f.status !== 'all') parts.push(STATUS_OPTIONS.find((o) => o.value === f.status)!.label);
  return parts.join(' · ');
}
