// Care credit: the sibling who gives time (pharmacy runs, appointments, time with the parent) pays
// a smaller part. The family picks the main caregiver and a credit percentage c. The caregiver pays
// their normal share times (1 - c); the part that frees up is shared between the others in
// proportion to their own normal shares. The result is an ordinary percentage rule (basis points,
// 10000 = 100 %), so the existing split, rounding and invoice code are reused.
import { equalBasisPoints, validateRule, type SplitRule } from './split';

export interface CareCredit {
  caregiverId: string;
  /** The credit in basis points of the caregiver's normal share: 2500 = 25 %. */
  basisPoints: number;
}

const TOTAL = 10_000;

/** What is wrong with the care credit for these members, or null when it is fine. */
export function validateCareCredit(credit: unknown, memberIds: string[]): string | null {
  if (typeof credit !== 'object' || credit === null) return 'The care credit is not valid';
  const c = credit as { caregiverId?: unknown; basisPoints?: unknown };
  if (typeof c.caregiverId !== 'string' || !memberIds.includes(c.caregiverId)) return 'Choose the main caregiver from the family';
  if (typeof c.basisPoints !== 'number' || !Number.isInteger(c.basisPoints) || c.basisPoints < 0 || c.basisPoints > TOTAL) {
    return 'The care credit must be between 0 and 100 percent, with at most two decimals';
  }
  return null;
}

/**
 * The percentages that result when `credit` is applied on top of `base`. Always whole basis points
 * that add up to exactly 10000. If nobody else pays anything (so there is no one to share the
 * credit with), the base rule is returned unchanged.
 */
export function careCreditRule(base: SplitRule, memberIds: string[], credit: CareCredit): Extract<SplitRule, { type: 'percent' }> {
  const problem = validateCareCredit(credit, memberIds) ?? validateRule(base, memberIds);
  if (problem) throw new Error(problem);

  // The normal shares as whole weights: equal shares weigh 1 each, percentages weigh their basis points.
  const weights: Record<string, number> = base.type === 'equal' ? Object.fromEntries(memberIds.map((id) => [id, 1])) : { ...base.basisPoints };
  const W = memberIds.reduce((sum, id) => sum + weights[id], 0);
  const wc = weights[credit.caregiverId];
  const S = W - wc; // the others' weight
  const c = credit.basisPoints;

  if (S === 0 || c === 0 || wc === 0) return { type: 'percent', basisPoints: base.type === 'equal' ? equalBasisPoints(memberIds) : { ...base.basisPoints } };

  // Exact fractions over one common denominator D = S * W:
  //   caregiver: bp = wc * (10000 - c) / W            -> numerator wc * (10000 - c) * S
  //   others:    bp = wj * (10000 * S + wc * c) / (S * W) -> numerator wj * (10000 * S + wc * c)
  const D = S * W;
  const numerators = memberIds.map((id) => (id === credit.caregiverId ? wc * (TOTAL - c) * S : weights[id] * (TOTAL * S + wc * c)));

  // Whole basis points: round down, then give the leftover units to the largest remainders (earlier members first).
  const floors = numerators.map((n) => Math.floor(n / D));
  const remainders = numerators.map((n, i) => ({ i, r: n - floors[i] * D }));
  let left = TOTAL - floors.reduce((s, v) => s + v, 0);
  remainders.sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of remainders) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return { type: 'percent', basisPoints: Object.fromEntries(memberIds.map((id, i) => [id, floors[i]])) };
}
