import { describe, expect, it } from 'vitest';
import { formatUsd, splitEqual } from './money';

const ids = ['anna', 'ben', 'clara'];
const sum = (parts: { amountCents: number }[]) => parts.reduce((s, p) => s + p.amountCents, 0);

describe('splitEqual', () => {
  it('splits an exact total evenly', () => {
    expect(splitEqual(3978, ids, 'anna').map((p) => p.amountCents)).toEqual([1326, 1326, 1326]);
  });

  it('gives the single odd cent to the payer', () => {
    expect(splitEqual(2638, ids, 'anna').map((p) => p.amountCents)).toEqual([880, 879, 879]);
    expect(splitEqual(2638, ids, 'ben').map((p) => p.amountCents)).toEqual([879, 880, 879]);
  });

  it('gives two odd cents to the payer and then the next member in list order', () => {
    expect(splitEqual(1001, ids, 'anna').map((p) => p.amountCents)).toEqual([334, 334, 333]);
    expect(splitEqual(1001, ids, 'clara').map((p) => p.amountCents)).toEqual([334, 333, 334]);
  });

  it('always sums to the total and never differs by more than one cent', () => {
    for (let total = 0; total <= 500; total++) {
      const parts = splitEqual(total, ids, 'anna');
      expect(sum(parts)).toBe(total);
      const amounts = parts.map((p) => p.amountCents);
      expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
    }
  });

  it('handles zero and a single member', () => {
    expect(splitEqual(0, ids, 'anna').map((p) => p.amountCents)).toEqual([0, 0, 0]);
    expect(splitEqual(999, ['anna'], 'anna')).toEqual([{ memberId: 'anna', amountCents: 999 }]);
  });

  it('rejects bad input', () => {
    expect(() => splitEqual(10.5, ids, 'anna')).toThrow();
    expect(() => splitEqual(-1, ids, 'anna')).toThrow();
    expect(() => splitEqual(100, [], 'anna')).toThrow();
    expect(() => splitEqual(100, ['anna', 'anna'], 'anna')).toThrow();
    expect(() => splitEqual(100, ids, 'zoe')).toThrow();
  });
});

describe('formatUsd', () => {
  it('formats cents as dollars', () => {
    expect(formatUsd(3978)).toBe('$39.78');
    expect(formatUsd(5)).toBe('$0.05');
    expect(formatUsd(110065)).toBe('$1,100.65');
  });
});
