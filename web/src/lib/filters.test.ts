import { describe, expect, it } from 'vitest';
import type { ReceiptView, ShareStatus } from '../../../shared/types';
import { applyFilters, describeFilters, filtersToParams, isFiltered, monthsIn, NO_FILTERS, parseFilters } from './filters';
import { receiptGroup, receiptSummary, sumShares, sumSpent } from './receipts';

const receipt = (id: string, date: string, total: number, statuses: ShareStatus[]): ReceiptView => ({
  id,
  merchant: id,
  date,
  payerId: 'anna',
  totalCents: total,
  shares: statuses.map((status, i) => ({ memberId: `m${i}`, amountCents: 1000 * (i + 1), status })),
});

const all = [
  receipt('oct-open', '2026-10-02', 3000, ['PAID', 'SENT']),
  receipt('oct-paid', '2026-10-20', 2000, ['PAID', 'PAID']),
  receipt('sep-unsent', '2026-09-28', 1000, ['DRAFT', 'DRAFT']),
  receipt('sep-cancelled', '2026-09-03', 500, ['CANCELLED', 'CANCELLED']),
  receipt('aug-mixed', '2026-08-15', 4000, ['PAID', 'CANCELLED']),
];

describe('receiptGroup and receiptSummary', () => {
  it('groups receipts by where they stand', () => {
    expect(all.map(receiptGroup)).toEqual(['open', 'paid', 'unsent', 'cancelled', 'paid']);
  });

  it('summarises with text as well as a tone', () => {
    expect(receiptSummary(all[0])).toEqual({ label: '1 of 2 paid', tone: 'partial' });
    expect(receiptSummary(all[1])).toEqual({ label: 'Paid', tone: 'paid' });
    expect(receiptSummary(all[2])).toEqual({ label: 'Not sent', tone: 'none' });
    expect(receiptSummary(all[3])).toEqual({ label: 'Cancelled', tone: 'cancelled' });
    expect(receiptSummary(all[4])).toEqual({ label: 'Paid', tone: 'paid' }); // the cancelled one no longer counts
  });

  it('does not call a receipt with no shares unsent or cancelled by accident', () => {
    expect(receiptGroup(receipt('x', '2026-10-01', 100, []))).toBe('unsent');
  });
});

describe('totals', () => {
  it('count paid and open shares, and ignore cancelled ones', () => {
    expect(sumShares(all)).toEqual({ paidCents: 1000 + 1000 + 2000 + 1000, openCents: 2000 + 1000 + 2000 });
    expect(sumSpent(all)).toBe(10500);
  });
});

describe('months', () => {
  it('lists the months that have receipts, newest first', () => {
    expect(monthsIn(all)).toEqual([
      { key: '2026-10', label: 'October 2026' },
      { key: '2026-09', label: 'September 2026' },
      { key: '2026-08', label: 'August 2026' },
    ]);
    expect(monthsIn([])).toEqual([]);
  });
});

describe('applyFilters', () => {
  const ids = (list: ReceiptView[]) => list.map((r) => r.id);

  it('keeps everything with no filters', () => {
    expect(ids(applyFilters(all, NO_FILTERS))).toHaveLength(5);
  });

  it('filters by month, by status, and by both', () => {
    expect(ids(applyFilters(all, { month: '2026-10', status: 'all' }))).toEqual(['oct-open', 'oct-paid']);
    expect(ids(applyFilters(all, { month: 'all', status: 'paid' }))).toEqual(['oct-paid', 'aug-mixed']);
    expect(ids(applyFilters(all, { month: '2026-09', status: 'unsent' }))).toEqual(['sep-unsent']);
    expect(ids(applyFilters(all, { month: '2026-08', status: 'open' }))).toEqual([]);
  });

  it('gives totals for just the selection', () => {
    const october = applyFilters(all, { month: '2026-10', status: 'all' });
    expect(sumSpent(october)).toBe(5000);
    expect(sumShares(october)).toEqual({ paidCents: 1000 + 1000 + 2000, openCents: 2000 });
  });
});

describe('filters in the address bar', () => {
  it('reads only real choices', () => {
    const months = ['2026-10', '2026-09'];
    expect(parseFilters(new URLSearchParams('month=2026-09&status=paid'), months)).toEqual({ month: '2026-09', status: 'paid' });
    expect(parseFilters(new URLSearchParams('month=1999-01&status=banana'), months)).toEqual(NO_FILTERS);
    expect(parseFilters(new URLSearchParams(''), months)).toEqual(NO_FILTERS);
    expect(parseFilters(new URLSearchParams('month=<script>'), months)).toEqual(NO_FILTERS);
  });

  it('writes nothing for the defaults', () => {
    expect(filtersToParams(NO_FILTERS)).toEqual({});
    expect(filtersToParams({ month: '2026-10', status: 'open' })).toEqual({ month: '2026-10', status: 'open' });
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ month: 'all', status: 'paid' })).toBe(true);
  });

  it('describes the selection in words', () => {
    expect(describeFilters(NO_FILTERS)).toBe('All months');
    expect(describeFilters({ month: '2026-10', status: 'open' })).toBe('October 2026 · Waiting for payment');
  });
});
