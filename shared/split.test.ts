import { describe, expect, it } from 'vitest';
import { equalBasisPoints, formatPercent, parsePercent, splitByRule, validateRule, type SplitRule } from './split';

const ids = ['anna', 'ben', 'clara'];
const pct = (anna: number, ben: number, clara: number): SplitRule => ({ type: 'percent', basisPoints: { anna, ben, clara } });
const sum = (parts: { amountCents: number }[]) => parts.reduce((s, p) => s + p.amountCents, 0);

describe('validateRule', () => {
  it('accepts equal and percentages that add up to 100', () => {
    expect(validateRule({ type: 'equal' }, ids)).toBeNull();
    expect(validateRule(pct(5000, 3000, 2000), ids)).toBeNull();
    expect(validateRule(pct(10000, 0, 0), ids)).toBeNull(); // someone at 0 % is fine
  });

  it('explains what is wrong', () => {
    expect(validateRule(pct(5000, 3000, 1500), ids)).toBe('The percentages add up to 95%, but they need to add up to 100%');
    expect(validateRule(pct(3334, 3333, 3334), ids)).toBe('The percentages add up to 100.01%, but they need to add up to 100%');
    expect(validateRule({ type: 'percent', basisPoints: { anna: 5000, ben: 5000 } }, ids)).toBe('Enter a percentage for each person');
    expect(validateRule({ type: 'percent', basisPoints: { anna: 5000, ben: 5000, clara: 0, zoe: 0 } }, ids)).toBe('Enter a percentage for each person');
    expect(validateRule(pct(-100, 5000, 5100), ids)).toMatch(/between 0 and 100/);
    expect(validateRule(pct(5000.5, 2999.5, 2000), ids)).toMatch(/between 0 and 100/);
    expect(validateRule({ type: 'banana' }, ids)).toBe('Choose how to split the costs');
    expect(validateRule(null, ids)).toBe('Choose how to split the costs');
  });
});

describe('equalBasisPoints', () => {
  it('always adds up to exactly 100 %', () => {
    expect(equalBasisPoints(ids)).toEqual({ anna: 3334, ben: 3333, clara: 3333 });
    expect(equalBasisPoints(['a', 'b'])).toEqual({ a: 5000, b: 5000 });
    for (const n of [1, 2, 3, 4]) {
      const members = Array.from({ length: n }, (_, i) => `m${i}`);
      expect(validateRule({ type: 'percent', basisPoints: equalBasisPoints(members) }, members)).toBeNull();
    }
  });
});

describe('splitByRule', () => {
  it('uses the equal split for the equal rule', () => {
    expect(splitByRule(3978, ids, 'anna', { type: 'equal' }).map((p) => p.amountCents)).toEqual([1326, 1326, 1326]);
  });

  it('splits by percentage, rounding the others down and giving the payer the rest', () => {
    // 50 / 30 / 20 of $46.68: Ben 14.004 -> 14.00, Clara 9.336 -> 9.33, the payer takes the other 23.35 (50 % is 23.34)
    expect(splitByRule(4668, ids, 'anna', pct(5000, 3000, 2000)).map((p) => p.amountCents)).toEqual([2335, 1400, 933]);
    // 33.34 / 33.33 / 33.33 of $10.00: others floor(333.3) = 333, payer takes 334
    expect(splitByRule(1000, ids, 'anna', pct(3334, 3333, 3333)).map((p) => p.amountCents)).toEqual([334, 333, 333]);
  });

  it('lets a member pay nothing, and keeps the order of the members', () => {
    const parts = splitByRule(5000, ids, 'anna', pct(5000, 0, 5000));
    expect(parts.map((p) => p.memberId)).toEqual(ids);
    expect(parts.map((p) => p.amountCents)).toEqual([2500, 0, 2500]);
  });

  it('works when the payer is not the first member', () => {
    expect(splitByRule(1001, ids, 'clara', pct(2000, 3000, 5000)).map((p) => p.amountCents)).toEqual([200, 300, 501]);
  });

  it('always sums to the total and never bills a sibling more than their percentage', () => {
    for (let total = 0; total <= 3000; total += 7) {
      for (const rule of [pct(2500, 2500, 5000), pct(3334, 3333, 3333), pct(0, 6000, 4000), pct(9999, 1, 0)]) {
        const parts = splitByRule(total, ids, 'anna', rule);
        expect(sum(parts)).toBe(total);
        for (const p of parts) {
          expect(p.amountCents).toBeGreaterThanOrEqual(0);
          if (p.memberId !== 'anna' && rule.type === 'percent') expect(p.amountCents).toBeLessThanOrEqual((total * rule.basisPoints[p.memberId]) / 10000);
        }
      }
    }
  });

  it('refuses an invalid rule instead of guessing', () => {
    expect(() => splitByRule(1000, ids, 'anna', pct(5000, 3000, 1000))).toThrow(/100%/);
    expect(() => splitByRule(1000, ids, 'zoe', pct(5000, 3000, 2000))).toThrow();
    expect(() => splitByRule(10.5, ids, 'anna', pct(5000, 3000, 2000))).toThrow();
  });
});

describe('percent text', () => {
  it('formats basis points', () => {
    expect(formatPercent(3334)).toBe('33.34');
    expect(formatPercent(5000)).toBe('50');
    expect(formatPercent(500)).toBe('5');
    expect(formatPercent(0)).toBe('0');
    expect(formatPercent(10000)).toBe('100');
    expect(formatPercent(1050)).toBe('10.5');
  });

  it('reads what people type', () => {
    expect(parsePercent('33.34')).toBe(3334);
    expect(parsePercent('33,3')).toBe(3330);
    expect(parsePercent('50')).toBe(5000);
    expect(parsePercent(' 50 % ')).toBe(5000);
    expect(parsePercent('0')).toBe(0);
    expect(parsePercent('100')).toBe(10000);
    for (const bad of ['', 'abc', '101', '33.333', '-5', '5..5', '1e2']) expect(parsePercent(bad), bad).toBeNull();
  });
});
