import { describe, expect, it } from 'vitest';
import { checkAmounts } from './receipt-check';

const base = { itemsCents: [749, 1299, 425, 700, 580], subtotalCents: 3753, discountCents: null, taxCents: 225, totalCents: 3978 };

describe('checkAmounts', () => {
  it('accepts a receipt that adds up', () => {
    expect(checkAmounts(base)).toEqual({ ok: true, problems: [] });
  });

  it('accepts discounts', () => {
    const r = checkAmounts({ itemsCents: [1499, 950, 750, 289], subtotalCents: 3488, discountCents: 850, taxCents: null, totalCents: 2638 });
    expect(r.ok).toBe(true);
  });

  it('works without a subtotal line', () => {
    expect(checkAmounts({ ...base, subtotalCents: null }).ok).toBe(true);
  });

  it('flags items that do not add up to the subtotal', () => {
    const r = checkAmounts({ ...base, itemsCents: [749, 1299, 425, 700, 500] });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toBe('The items add up to $36.73, but the subtotal says $37.53.');
  });

  it('flags a wrong total', () => {
    const r = checkAmounts({ ...base, totalCents: 3900 });
    expect(r.problems).toEqual(['Subtotal plus tax is $39.78, but the total says $39.00.']);
  });

  it('mentions discounts when there are some', () => {
    const r = checkAmounts({ itemsCents: [1000], subtotalCents: 1000, discountCents: 100, taxCents: null, totalCents: 1000 });
    expect(r.problems).toEqual(['Subtotal minus discounts plus tax is $9.00, but the total says $10.00.']);
  });

  it('asks for the missing pieces', () => {
    expect(checkAmounts({ itemsCents: [], subtotalCents: null, discountCents: null, taxCents: null, totalCents: null }).problems).toEqual([
      'Add at least one item.',
      'Add the total.',
    ]);
  });
});
