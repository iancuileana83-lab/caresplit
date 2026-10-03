import { describe, expect, it } from 'vitest';
import { analyse, confirmDraft, emptyDraft, newItem, parseMoney, readingToDraft } from './draft';
import type { ReceiptReading } from '../../../shared/receipt-check';

const reading: ReceiptReading = {
  merchant: 'GREEN LEAF PHARMACY',
  date: '2026-10-02',
  currency: 'USD',
  items: [
    { name: 'Pain relief tablets 24ct', quantity: null, lineTotalCents: 749 },
    { name: 'Vitamin D3 60ct', quantity: null, lineTotalCents: 1299 },
    { name: 'Cough lozenges', quantity: 2, lineTotalCents: 700 },
  ],
  subtotalCents: 2748,
  discountCents: null,
  taxCents: 165,
  totalCents: 2913,
};

describe('parseMoney', () => {
  it('reads common ways of writing an amount', () => {
    expect(parseMoney('7.49')).toEqual({ cents: 749, invalid: false });
    expect(parseMoney('$7.49')).toEqual({ cents: 749, invalid: false });
    expect(parseMoney('7,49')).toEqual({ cents: 749, invalid: false });
    expect(parseMoney('1,100.65')).toEqual({ cents: 110065, invalid: false });
    expect(parseMoney('12')).toEqual({ cents: 1200, invalid: false });
    expect(parseMoney('0.5')).toEqual({ cents: 50, invalid: false });
    expect(parseMoney('0.07')).toEqual({ cents: 7, invalid: false });
  });
  it('treats empty as no value and junk as invalid', () => {
    expect(parseMoney('  ')).toEqual({ cents: null, invalid: false });
    for (const bad of ['abc', '7.499', '-3', '1.2.3', '7..4', '$$5']) expect(parseMoney(bad).invalid).toBe(true);
  });
});

describe('analyse and confirmDraft', () => {
  it('passes a reading that adds up', () => {
    const d = readingToDraft(reading);
    expect(analyse(d).check.ok).toBe(true);
    const c = confirmDraft(d);
    expect(c.errors).toEqual([]);
    expect(c.receipt?.totalCents).toBe(2913);
    expect(c.receipt?.items[2]).toEqual({ name: 'Cough lozenges', quantity: 2, lineTotalCents: 700 });
  });

  it('notices an edit that breaks the amounts and recovers when fixed', () => {
    const d = readingToDraft(reading);
    d.items[0].amount = '8.49';
    expect(analyse(d).check.ok).toBe(false);
    d.items[0].amount = '7.49';
    expect(analyse(d).check.ok).toBe(true);
  });

  it('flags invalid amounts without crashing', () => {
    const d = readingToDraft(reading);
    d.items[1].amount = 'twelve';
    d.tax = '1.2.3';
    const a = analyse(d);
    expect(a.invalidFields.has(d.items[1].key)).toBe(true);
    expect(a.invalidFields.has('tax')).toBe(true);
    expect(confirmDraft(d).errors).toContain('Some amounts are not valid. Use numbers like 7.49.');
  });

  it('asks for the basics on an empty form and ignores blank rows', () => {
    const d = emptyDraft();
    d.items.push(newItem());
    expect(confirmDraft(d).errors).toEqual(['Add the pharmacy name.', 'Pick the date on the receipt.', 'Add at least one item.', 'Add the total.']);
  });

  it('lets the user continue with a mismatch (the screen warns, the user decides)', () => {
    const d = readingToDraft(reading);
    d.total = '30.00';
    expect(analyse(d).check.ok).toBe(false);
    expect(confirmDraft(d).errors).toEqual([]);
  });
});
