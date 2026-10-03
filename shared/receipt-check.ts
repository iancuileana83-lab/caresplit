import { formatUsd } from './money';

/** What the AI read from a receipt photo, as the server returns it. Money is integer cents. */
export interface ReceiptReading {
  merchant: string | null;
  /** ISO date, YYYY-MM-DD */
  date: string | null;
  currency: string | null;
  items: { name: string; quantity: number | null; lineTotalCents: number }[];
  subtotalCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
}

export interface AmountsInput {
  itemsCents: number[];
  subtotalCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
}

export interface CheckResult {
  ok: boolean;
  problems: string[];
}

/**
 * The "Amounts add up" check, run on the AI's reading and again on every edit:
 * items add up to the subtotal, and subtotal minus discounts plus tax gives the total.
 */
export function checkAmounts(input: AmountsInput): CheckResult {
  const problems: string[] = [];
  const itemsSum = input.itemsCents.reduce((s, c) => s + c, 0);

  if (input.itemsCents.length === 0) problems.push('Add at least one item.');
  if (input.totalCents === null) problems.push('Add the total.');

  if (input.subtotalCents !== null && input.itemsCents.length > 0 && itemsSum !== input.subtotalCents) {
    problems.push(`The items add up to ${formatUsd(itemsSum)}, but the subtotal says ${formatUsd(input.subtotalCents)}.`);
  }

  if (input.totalCents !== null) {
    const base = input.subtotalCents ?? itemsSum;
    const expected = base - (input.discountCents ?? 0) + (input.taxCents ?? 0);
    if (input.itemsCents.length > 0 && expected !== input.totalCents) {
      const label = input.discountCents ? 'Subtotal minus discounts plus tax' : 'Subtotal plus tax';
      problems.push(`${label} is ${formatUsd(expected)}, but the total says ${formatUsd(input.totalCents)}.`);
    }
  }

  return { ok: problems.length === 0, problems };
}

export function checkReading(r: ReceiptReading): CheckResult {
  return checkAmounts({
    itemsCents: r.items.map((i) => i.lineTotalCents),
    subtotalCents: r.subtotalCents,
    discountCents: r.discountCents,
    taxCents: r.taxCents,
    totalCents: r.totalCents,
  });
}
