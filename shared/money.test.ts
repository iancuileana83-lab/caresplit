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

  it('gives two odd cents to the payer too, so the others always pay the same', () => {
    expect(splitEqual(1001, ids, 'anna').map((p) => p.amountCents)).toEqual([335, 333, 333]);
    expect(splitEqual(1001, ids, 'clara').map((p) => p.amountCents)).toEqual([333, 333, 335]);
    expect(splitEqual(974, ids, 'anna').map((p) => p.amountCents)).toEqual([326, 324, 324]);
  });

  it('always sums to the total, siblings pay equal amounts and the payer pays at most 2 cents more', () => {
    for (let total = 0; total <= 500; total++) {
      const parts = splitEqual(total, ids, 'anna');
      expect(sum(parts)).toBe(total);
      const [anna, ben, clara] = parts.map((p) => p.amountCents);
      expect(ben).toBe(clara);
      expect(anna - ben).toBeGreaterThanOrEqual(0);
      expect(anna - ben).toBeLessThanOrEqual(2);
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
