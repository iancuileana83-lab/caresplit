// Checks a receipt sent by the browser before it is saved. Everything is bounded: sizes, lengths, amounts.
export interface NewReceiptInput {
  merchant: string;
  date: string;
  currency: string;
  items: { name: string; quantity: number | null; lineTotalCents: number }[];
  subtotalCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  totalCents: number;
}

const MAX_CENTS = 100_000_00; // $100,000: far above any pharmacy receipt

const isCents = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_CENTS;
const isCentsOrNull = (v: unknown): v is number | null => v === null || isCents(v);

/** Returns the cleaned receipt, or a message saying what is wrong. */
export function parseNewReceipt(body: unknown): { ok: true; value: NewReceiptInput } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Send the receipt as JSON' };
  const b = body as Record<string, unknown>;

  const merchant = typeof b.merchant === 'string' ? b.merchant.trim() : '';
  if (merchant.length < 1 || merchant.length > 80) return { ok: false, error: 'The pharmacy name must be 1 to 80 characters' };

  const date = b.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    return { ok: false, error: 'The date must look like 2026-10-02' };
  }

  if (b.currency !== 'USD') return { ok: false, error: 'CareSplit sends invoices in US dollars only' };

  if (!isCents(b.totalCents) || b.totalCents <= 0) return { ok: false, error: 'The total must be more than zero' };
  if (!isCentsOrNull(b.subtotalCents) || !isCentsOrNull(b.discountCents) || !isCentsOrNull(b.taxCents)) return { ok: false, error: 'Some amounts are not valid' };

  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 60) return { ok: false, error: 'A receipt needs 1 to 60 items' };
  const items: NewReceiptInput['items'] = [];
  for (const raw of b.items) {
    const it = raw as Record<string, unknown> | null;
    const name = typeof it?.name === 'string' ? it.name.trim() : '';
    const q = it?.quantity;
    if (name.length < 1 || name.length > 80 || !isCents(it?.lineTotalCents)) return { ok: false, error: 'Some items are not valid' };
    if (!(q === null || q === undefined || (typeof q === 'number' && Number.isInteger(q) && q > 0 && q < 1000))) return { ok: false, error: 'Some quantities are not valid' };
    items.push({ name, quantity: typeof q === 'number' ? q : null, lineTotalCents: it.lineTotalCents as number });
  }

  return {
    ok: true,
    value: {
      merchant,
      date,
      currency: 'USD',
      items,
      subtotalCents: b.subtotalCents as number | null,
      discountCents: b.discountCents as number | null,
      taxCents: b.taxCents as number | null,
      totalCents: b.totalCents,
    },
  };
}
