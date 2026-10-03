// Money helpers. Amounts are integer cents so shares always add up exactly.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatUsd(cents: number): string {
  return usd.format(cents / 100);
}

export interface SplitPart {
  memberId: string;
  amountCents: number;
}

/**
 * Splits a total equally between the members, to the cent.
 * The odd cents go to the payer first (the organiser absorbs them, so a sibling is never
 * billed a cent more than anyone else), then to the other members in list order.
 * The result keeps the order of `memberIds` and always sums to `totalCents`.
 */
export function splitEqual(totalCents: number, memberIds: string[], payerId: string): SplitPart[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new Error('totalCents must be a whole number of cents, 0 or more');
  if (memberIds.length === 0) throw new Error('at least one member is needed');
  if (new Set(memberIds).size !== memberIds.length) throw new Error('members must be unique');
  if (!memberIds.includes(payerId)) throw new Error('the payer must be one of the members');

  const base = Math.floor(totalCents / memberIds.length);
  let remainder = totalCents - base * memberIds.length;

  const extraOrder = [payerId, ...memberIds.filter((id) => id !== payerId)];
  const extra = new Map<string, number>();
  for (const id of extraOrder) {
    if (remainder === 0) break;
    extra.set(id, 1);
    remainder -= 1;
  }
  return memberIds.map((memberId) => ({ memberId, amountCents: base + (extra.get(memberId) ?? 0) }));
}
