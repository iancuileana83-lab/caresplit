// How a receipt total is divided between family members: equally, or by percentages.
// Percentages are kept as basis points (hundredths of a percent, 10000 = 100 %) so the sum is
// exact and never suffers from floating point rounding.
import { splitEqual, type SplitPart } from './money';

export type SplitRule = { type: 'equal' } | { type: 'percent'; basisPoints: Record<string, number> };

export const EQUAL_RULE: SplitRule = { type: 'equal' };

const TOTAL_BP = 10_000;

/** Returns what is wrong with the rule for these members, or null when it is fine. */
export function validateRule(rule: unknown, memberIds: string[]): string | null {
  if (typeof rule !== 'object' || rule === null) return 'Choose how to split the costs';
  const r = rule as { type?: unknown; basisPoints?: unknown };
  if (r.type === 'equal') return null;
  if (r.type !== 'percent') return 'Choose how to split the costs';
  if (typeof r.basisPoints !== 'object' || r.basisPoints === null) return 'Enter a percentage for each person';
  const bp = r.basisPoints as Record<string, unknown>;
  const keys = Object.keys(bp);
  if (keys.length !== memberIds.length || !memberIds.every((id) => keys.includes(id))) return 'Enter a percentage for each person';
  let sum = 0;
  for (const id of memberIds) {
    const v = bp[id];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > TOTAL_BP) return 'Percentages must be between 0 and 100, with at most two decimals';
    sum += v;
  }
  if (sum !== TOTAL_BP) return `The percentages add up to ${formatPercent(sum)}%, but they need to add up to 100%`;
  return null;
}

/** Equal percentages that add up to exactly 100: three people get 33.34, 33.33 and 33.33. */
export function equalBasisPoints(memberIds: string[]): Record<string, number> {
  const base = Math.floor(TOTAL_BP / memberIds.length);
  let extra = TOTAL_BP - base * memberIds.length;
  const out: Record<string, number> = {};
  for (const id of memberIds) {
    out[id] = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
  }
  return out;
}

/**
 * Splits `totalCents` between the members by the rule. The payer (the organiser) takes whatever the
 * others do not: with percentages every other member pays their percentage rounded down to the
 * cent, so nobody else is ever billed a cent too much, and the shares always add up to the total.
 */
export function splitByRule(totalCents: number, memberIds: string[], payerId: string, rule: SplitRule): SplitPart[] {
  if (rule.type === 'equal') return splitEqual(totalCents, memberIds, payerId);
  const problem = validateRule(rule, memberIds);
  if (problem) throw new Error(problem);
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new Error('totalCents must be a whole number of cents, 0 or more');
  if (!memberIds.includes(payerId)) throw new Error('the payer must be one of the members');
  const others = memberIds.filter((id) => id !== payerId).map((memberId) => ({ memberId, amountCents: Math.floor((totalCents * rule.basisPoints[memberId]) / TOTAL_BP) }));
  const payerCents = totalCents - others.reduce((s, p) => s + p.amountCents, 0);
  const byId = new Map([...others, { memberId: payerId, amountCents: payerCents }].map((p) => [p.memberId, p]));
  return memberIds.map((id) => byId.get(id)!);
}

/** 3334 -> "33.34", 5000 -> "50", 500 -> "5" */
export function formatPercent(bp: number): string {
  return (bp / 100).toFixed(2).replace(/\.?0+$/, '');
}

/** "33.34" or "33,34" or "50" -> basis points. Null when it is not a percentage with at most two decimals. */
export function parsePercent(text: string): number | null {
  const t = text.trim().replace(/%$/, '').replace(',', '.').trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  const bp = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return bp <= TOTAL_BP ? bp : null;
}
