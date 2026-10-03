import { describe, expect, it } from 'vitest';
import { parseNewReceipt } from './validate';

const good = {
  merchant: ' Green Leaf Pharmacy ',
  date: '2026-10-02',
  currency: 'USD',
  items: [{ name: ' Pain relief ', quantity: 2, lineTotalCents: 700 }],
  subtotalCents: 700,
  discountCents: null,
  taxCents: null,
  totalCents: 700,
};

const bad = (patch: Record<string, unknown>) => parseNewReceipt({ ...good, ...patch });

describe('parseNewReceipt', () => {
  it('accepts a good receipt and trims text', () => {
    const r = parseNewReceipt(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.merchant).toBe('Green Leaf Pharmacy');
      expect(r.value.items[0]).toEqual({ name: 'Pain relief', quantity: 2, lineTotalCents: 700 });
    }
  });

  it('rejects anything out of bounds', () => {
    for (const patch of [
      { merchant: '' },
      { merchant: 'x'.repeat(81) },
      { date: '10/02/2026' },
      { date: '2026-02-30' },
      { currency: 'EUR' },
      { totalCents: 0 },
      { totalCents: 12.5 },
      { totalCents: -5 },
      { totalCents: 10_000_001 },
      { taxCents: 'a lot' },
      { items: [] },
      { items: Array.from({ length: 61 }, () => good.items[0]) },
      { items: [{ name: '', lineTotalCents: 5 }] },
      { items: [{ name: 'a', lineTotalCents: 1.5 }] },
      { items: [{ name: 'a', quantity: 0, lineTotalCents: 5 }] },
    ]) {
      expect(bad(patch).ok, JSON.stringify(patch)).toBe(false);
    }
    expect(parseNewReceipt(null).ok).toBe(false);
    expect(parseNewReceipt('text').ok).toBe(false);
  });
});
