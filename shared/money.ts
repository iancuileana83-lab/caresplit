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
 * The payer (the organiser) absorbs all the odd cents, at most one fewer than the number of
 * members, so every other member pays exactly the same rounded-down amount and is never
 * billed a cent more than anyone else.
 * The result keeps the order of `memberIds` and always sums to `totalCents`.
 */
export function splitEqual(totalCents: number, memberIds: string[], payerId: string): SplitPart[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new Error('totalCents must be a whole number of cents, 0 or more');
  if (memberIds.length === 0) throw new Error('at least one member is needed');
  if (new Set(memberIds).size !== memberIds.length) throw new Error('members must be unique');
  if (!memberIds.includes(payerId)) throw new Error('the payer must be one of the members');

  const base = Math.floor(totalCents / memberIds.length);
  const remainder = totalCents - base * memberIds.length;
  return memberIds.map((memberId) => ({ memberId, amountCents: base + (memberId === payerId ? remainder : 0) }));
}
