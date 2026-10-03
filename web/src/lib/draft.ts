import { checkAmounts, type AmountsInput, type CheckResult, type ReceiptReading } from '../../../shared/receipt-check';

/** The receipt as the user edits it on the review screen: every field is text until confirmed. */
export interface DraftItem {
  key: string;
  name: string;
  /** Kept from the reading (shown, not edited). Empty when there is no quantity. */
  quantity: string;
  amount: string;
}

export interface Draft {
  merchant: string;
  /** YYYY-MM-DD, or empty */
  date: string;
  currency: string;
  items: DraftItem[];
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
}

/** A receipt the user has checked and confirmed. Money is integer cents. */
export interface ConfirmedReceipt {
  merchant: string;
  date: string;
  currency: string;
  items: { name: string; quantity: number | null; lineTotalCents: number }[];
  subtotalCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  totalCents: number;
}

export interface MoneyParse {
  cents: number | null;
  invalid: boolean;
}

/** Accepts "7.49", "$7.49", "7,49" and "1,100.65". Empty is fine (no value); anything else is invalid. */
export function parseMoney(text: string): MoneyParse {
  let t = text.trim().replace(/^\$/, '').replace(/\s/g, '');
  if (t === '') return { cents: null, invalid: false };
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { cents: null, invalid: true };
  const [dollars, frac = ''] = t.split('.');
  const cents = Number(dollars) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? { cents, invalid: false } : { cents: null, invalid: true };
}

export function centsToText(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2);
}

let keyCounter = 0;
export const newItem = (): DraftItem => ({ key: `i${++keyCounter}`, name: '', quantity: '', amount: '' });

export function emptyDraft(): Draft {
  return { merchant: '', date: '', currency: 'USD', items: [newItem()], subtotal: '', discount: '', tax: '', total: '' };
}

export function readingToDraft(r: ReceiptReading): Draft {
  return {
    merchant: r.merchant ?? '',
    date: r.date ?? '',
    currency: r.currency ?? 'USD',
    items: r.items.length
      ? r.items.map((i) => ({ key: `i${++keyCounter}`, name: i.name, quantity: i.quantity && i.quantity > 1 ? String(i.quantity) : '', amount: centsToText(i.lineTotalCents) }))
      : [newItem()],
    subtotal: centsToText(r.subtotalCents),
    discount: centsToText(r.discountCents),
    tax: centsToText(r.taxCents),
    total: centsToText(r.totalCents),
  };
}

export interface Analysis {
  amounts: AmountsInput;
  check: CheckResult;
  /** Keys of fields whose text is not a valid amount: item keys, or 'subtotal' | 'discount' | 'tax' | 'total'. */
  invalidFields: Set<string>;
  parsed: { subtotal: MoneyParse; discount: MoneyParse; tax: MoneyParse; total: MoneyParse };
}

/** Parses every amount in the draft and runs the "Amounts add up" check on what could be read. */
export function analyse(draft: Draft): Analysis {
  const invalidFields = new Set<string>();
  const itemsCents: number[] = [];
  for (const it of draft.items) {
    if (it.name.trim() === '' && it.amount.trim() === '') continue; // an untouched blank row
    const p = parseMoney(it.amount);
    if (p.invalid || p.cents === null) invalidFields.add(it.key);
    else itemsCents.push(p.cents);
  }
  const parsed = {
    subtotal: parseMoney(draft.subtotal),
    discount: parseMoney(draft.discount),
    tax: parseMoney(draft.tax),
    total: parseMoney(draft.total),
  };
  for (const [k, p] of Object.entries(parsed)) if (p.invalid) invalidFields.add(k);

  const amounts: AmountsInput = {
    itemsCents,
    subtotalCents: parsed.subtotal.cents,
    discountCents: parsed.discount.cents,
    taxCents: parsed.tax.cents,
    totalCents: parsed.total.cents,
  };
  return { amounts, check: checkAmounts(amounts), invalidFields, parsed };
}

export interface ConfirmResult {
  receipt?: ConfirmedReceipt;
  /** Things the user must fix before continuing. */
  errors: string[];
}

export function confirmDraft(draft: Draft): ConfirmResult {
  const a = analyse(draft);
  const errors: string[] = [];
  if (draft.merchant.trim() === '') errors.push('Add the pharmacy name.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.push('Pick the date on the receipt.');
  if (a.invalidFields.size > 0) errors.push('Some amounts are not valid. Use numbers like 7.49.');
  for (const it of draft.items) {
    const blank = it.name.trim() === '' && it.amount.trim() === '';
    if (!blank && it.name.trim() === '') errors.push('Every item needs a name.');
  }
  if (a.amounts.itemsCents.length === 0) errors.push('Add at least one item.');
  if (a.amounts.totalCents === null || a.amounts.totalCents <= 0) errors.push('Add the total.');
  if (errors.length > 0) return { errors: [...new Set(errors)] };

  const items = draft.items
    .filter((it) => !(it.name.trim() === '' && it.amount.trim() === ''))
    .map((it) => ({
      name: it.name.trim(),
      quantity: it.quantity ? Number(it.quantity) : null,
      lineTotalCents: parseMoney(it.amount).cents as number,
    }));
  return {
    errors: [],
    receipt: {
      merchant: draft.merchant.trim(),
      date: draft.date,
      currency: draft.currency,
      items,
      subtotalCents: a.amounts.subtotalCents,
      discountCents: a.amounts.discountCents,
      taxCents: a.amounts.taxCents,
      totalCents: a.amounts.totalCents as number,
    },
  };
}
