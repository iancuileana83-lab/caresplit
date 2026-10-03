import { describe, expect, it } from 'vitest';
import { careCreditRule, validateCareCredit } from './care';
import { splitByRule, type SplitRule } from './split';

const ids = ['anna', 'ben', 'clara'];
const pct = (anna: number, ben: number, clara: number): SplitRule => ({ type: 'percent', basisPoints: { anna, ben, clara } });
const bp = (rule: SplitRule) => (rule.type === 'percent' ? rule.basisPoints : {});
const total = (rule: SplitRule) => Object.values(bp(rule)).reduce((s, v) => s + v, 0);

describe('validateCareCredit', () => {
  it('accepts a family member and a percentage from 0 to 100', () => {
    expect(validateCareCredit({ caregiverId: 'ben', basisPoints: 2500 }, ids)).toBeNull();
    expect(validateCareCredit({ caregiverId: 'ben', basisPoints: 0 }, ids)).toBeNull();
    expect(validateCareCredit({ caregiverId: 'ben', basisPoints: 10000 }, ids)).toBeNull();
  });

  it('refuses anything else', () => {
    for (const bad of [null, 'ben', {}, { caregiverId: 'zoe', basisPoints: 100 }, { caregiverId: 'ben', basisPoints: -1 }, { caregiverId: 'ben', basisPoints: 10001 }, { caregiverId: 'ben', basisPoints: 12.5 }, { caregiverId: 'ben', basisPoints: '25' }]) {
      expect(validateCareCredit(bad, ids), JSON.stringify(bad)).not.toBeNull();
    }
  });
});

describe('careCreditRule', () => {
  it('the worked example: equal shares, Ben gets a 25 % credit -> Ben 25 %, the others 37.5 %', () => {
    expect(bp(careCreditRule({ type: 'equal' }, ids, { caregiverId: 'ben', basisPoints: 2500 }))).toEqual({ anna: 3750, ben: 2500, clara: 3750 });
  });

  it('takes a percentage rule as the starting point and shares the freed part in proportion', () => {
    // Clara pays 20 %, her 50 % credit frees 10 points, shared 5:3 between Anna (50 %) and Ben (30 %)
    expect(bp(careCreditRule(pct(5000, 3000, 2000), ids, { caregiverId: 'clara', basisPoints: 5000 }))).toEqual({ anna: 5625, ben: 3375, clara: 1000 });
  });

  it('leaves the base shares alone with no credit, and lets a 100 % credit free the caregiver completely', () => {
    expect(bp(careCreditRule(pct(5000, 3000, 2000), ids, { caregiverId: 'ben', basisPoints: 0 }))).toEqual({ anna: 5000, ben: 3000, clara: 2000 });
    expect(bp(careCreditRule({ type: 'equal' }, ids, { caregiverId: 'ben', basisPoints: 10000 }))).toEqual({ anna: 5000, ben: 0, clara: 5000 });
  });

  it('always adds up to exactly 100 %, with whole basis points, when thirds do not divide evenly', () => {
    const rule = careCreditRule({ type: 'equal' }, ids, { caregiverId: 'ben', basisPoints: 5000 });
    expect(bp(rule)).toEqual({ anna: 4167, ben: 1667, clara: 4166 }); // the two spare units go to the earlier members
    expect(total(rule)).toBe(10000);
  });

  it('the caregiver never pays more, and nobody else pays less, than without the credit', () => {
    const bases: SplitRule[] = [{ type: 'equal' }, pct(5000, 3000, 2000), pct(3334, 3333, 3333), pct(7000, 2000, 1000), pct(0, 6000, 4000)];
    for (const base of bases) {
      const before = base.type === 'equal' ? { anna: 10000 / 3, ben: 10000 / 3, clara: 10000 / 3 } : bp(base);
      for (const caregiverId of ids) {
        for (const c of [0, 1, 333, 1000, 2500, 5000, 7777, 9999, 10000]) {
          const after = bp(careCreditRule(base, ids, { caregiverId, basisPoints: c }));
          expect(Object.values(after).reduce((s, v) => s + v, 0)).toBe(10000);
          for (const id of ids) {
            expect(Number.isInteger(after[id]) && after[id] >= 0).toBe(true);
            const slack = 1.01; // whole-unit rounding
            if (id === caregiverId) expect(after[id]).toBeLessThanOrEqual(before[id] + slack);
            else expect(after[id]).toBeGreaterThanOrEqual(before[id] - slack);
          }
        }
      }
    }
  });

  it('returns the base unchanged when nobody else pays anything or the caregiver pays nothing anyway', () => {
    expect(bp(careCreditRule(pct(10000, 0, 0), ids, { caregiverId: 'anna', basisPoints: 5000 }))).toEqual({ anna: 10000, ben: 0, clara: 0 });
    expect(bp(careCreditRule(pct(5000, 0, 5000), ids, { caregiverId: 'ben', basisPoints: 5000 }))).toEqual({ anna: 5000, ben: 0, clara: 5000 });
    expect(bp(careCreditRule({ type: 'equal' }, ['solo'], { caregiverId: 'solo', basisPoints: 5000 }))).toEqual({ solo: 10000 });
  });

  it('works with two and four people', () => {
    expect(bp(careCreditRule({ type: 'equal' }, ['a', 'b'], { caregiverId: 'b', basisPoints: 4000 }))).toEqual({ a: 7000, b: 3000 });
    const four = bp(careCreditRule({ type: 'equal' }, ['a', 'b', 'c', 'd'], { caregiverId: 'd', basisPoints: 2000 }));
    expect(four.d).toBe(2000); // 25 % x 0.8
    expect(Object.values(four).reduce((s, v) => s + v, 0)).toBe(10000);
  });

  it('refuses an invalid credit or an invalid base rule', () => {
    expect(() => careCreditRule({ type: 'equal' }, ids, { caregiverId: 'zoe', basisPoints: 100 })).toThrow();
    expect(() => careCreditRule(pct(5000, 3000, 1000), ids, { caregiverId: 'ben', basisPoints: 100 })).toThrow(/100%/);
  });
});

describe('what the credit does to the money (46.68 USD, equal shares, Ben gets 25 %)', () => {
  it('Ben pays 3.89 less, the others make it up, and the total is unchanged', () => {
    const rule = careCreditRule({ type: 'equal' }, ids, { caregiverId: 'ben', basisPoints: 2500 });
    const base = splitByRule(4668, ids, 'anna', { type: 'equal' }).map((p) => p.amountCents);
    const withCredit = splitByRule(4668, ids, 'anna', rule).map((p) => p.amountCents);
    expect(base).toEqual([1556, 1556, 1556]);
    expect(withCredit).toEqual([1751, 1167, 1750]);
    expect(base[1] - withCredit[1]).toBe(389); // the credit on Ben's invoice
    expect(withCredit.reduce((s, v) => s + v, 0)).toBe(4668);
  });
});
