// The tools the assistant may call. Reading tools answer from the family's own receipts; the numbers are worked
// out here, in code, never by the model. Proposal tools only PROPOSE an action (see actions.ts): nothing changes
// until the organiser presses Confirm. No tool takes a family id: they only ever see the family they were built for.
import { formatUsd } from '../../shared/money';
import type { PendingAction, ReceiptStore, StoredFamily, StoredReceipt, StoredShare } from '../store';
import { cleanText } from '../text';
import { proposeAction, type ActionContext, type ProposalInput } from './actions';

export interface ToolContext {
  family: StoredFamily;
  receipts: ReceiptStore;
  /** Today, YYYY-MM-DD, so "this month" and "last week" mean something. */
  today: string;
  action: ActionContext;
  /** Reads fresh invoice statuses from PayPal (no confirmation needed: it changes no money). Absent when PayPal is off. */
  refresh?: (receiptId: string) => Promise<string>;
}

export interface ToolOutcome {
  /** What the model gets back. */
  result: Record<string, unknown>;
  /** A card for the organiser, when the tool made (or found) a proposal. */
  action?: PendingAction;
}

type Schema = { type: string; description?: string; enum?: string[]; properties?: Record<string, Schema>; required?: string[] };
const str = (description: string, values?: string[]): Schema => ({ type: 'STRING', description, ...(values ? { enum: values } : {}) });
const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: 'OBJECT', properties, required });

export const TOOL_DECLARATIONS = [
  {
    name: 'get_summary',
    description: 'Totals for a period (all receipts if no dates): money spent, shares still open, paid back, and per person what they owe and paid, plus care credit. Use for "how much did we spend", "how much did Ben pay".',
    parameters: obj({ from: str('First day, YYYY-MM-DD'), to: str('Last day, YYYY-MM-DD') }),
  },
  {
    name: 'list_receipts',
    description: 'Lists receipts (newest first) with who owes what, optionally for one month or one status. Use it to find a receipt id before proposing an action.',
    parameters: obj({ month: str('YYYY-MM'), status: str('Where the receipt stands', ['open', 'paid', 'unsent', 'cancelled']) }),
  },
  {
    name: 'get_receipt',
    description: 'One receipt in detail: items, total, each person share and status, care credit.',
    parameters: obj({ receiptId: str('The id from list_receipts') }, ['receiptId']),
  },
  { name: 'who_owes', description: 'Everyone who still owes something: open shares per person with the receipts they belong to. Use for "who has not paid".', parameters: obj({}) },
  {
    name: 'refresh_statuses',
    description: 'Reads the latest invoice statuses of one receipt from PayPal. Changes no money, so it needs no confirmation.',
    parameters: obj({ receiptId: str('The id from list_receipts') }, ['receiptId']),
  },
  {
    name: 'propose_reminder',
    description: 'Proposes a polite payment reminder for one person on one receipt. It only shows a card; the organiser must press Confirm.',
    parameters: obj({ receiptId: str('The id from list_receipts'), memberName: str('First name of the person') }, ['receiptId', 'memberName']),
  },
  {
    name: 'propose_mark_paid',
    description: 'Proposes recording that one person paid their share outside PayPal. Ask how it was paid if the organiser did not say. It only shows a card.',
    parameters: obj(
      { receiptId: str('The id from list_receipts'), memberName: str('First name of the person'), method: str('How it was paid', ['CASH', 'BANK_TRANSFER', 'OTHER']), note: str('A short optional note') },
      ['receiptId', 'memberName', 'method'],
    ),
  },
  {
    name: 'propose_cancel_invoice',
    description: 'Proposes cancelling one person unpaid invoice on one receipt. It only shows a card.',
    parameters: obj({ receiptId: str('The id from list_receipts'), memberName: str('First name of the person') }, ['receiptId', 'memberName']),
  },
  {
    name: 'propose_send_invoices',
    description: 'Proposes sending the invoices of one receipt that have not been sent yet. It only shows a card.',
    parameters: obj({ receiptId: str('The id from list_receipts') }, ['receiptId']),
  },
];

export const TOOL_NAMES = new Set(TOOL_DECLARATIONS.map((t) => t.name));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const asString = (v: unknown, max = 80) => cleanText(v, max);

type Group = 'paid' | 'open' | 'unsent' | 'cancelled';
const SHARE_LABEL: Record<StoredShare['status'], string> = { PAID: 'paid', SENT: 'waiting for payment', DRAFT: 'not sent yet', CANCELLED: 'cancelled' };

function groupOf(r: StoredReceipt): Group {
  const live = r.shares.filter((s) => s.status !== 'CANCELLED');
  if (r.shares.length > 0 && live.length === 0) return 'cancelled';
  if (live.length > 0 && live.every((s) => s.status === 'PAID')) return 'paid';
  if (live.every((s) => s.status === 'DRAFT')) return 'unsent';
  return 'open';
}

const money = (cents: number) => ({ cents, text: formatUsd(cents) });

function shareLine(s: StoredShare, family: StoredFamily) {
  const name = family.members.find((m) => m.id === s.memberId)?.name ?? s.memberName ?? 'Someone';
  return { person: cleanText(name, 20), amount: money(s.amountCents), status: SHARE_LABEL[s.status], ...(s.paidOutside ? { paidOutsidePayPalBy: s.paidOutside.method.toLowerCase().replace('_', ' ') } : {}) };
}

function receiptLine(r: StoredReceipt, family: StoredFamily) {
  return {
    receiptId: r.id,
    // Text read from a photo is data, kept short and clean.
    pharmacy: cleanText(r.merchant, 60),
    date: r.date,
    total: money(r.totalCents),
    standing: groupOf(r),
    ...(r.sample ? { sampleReceipt: true } : {}),
    shares: r.shares.map((s) => shareLine(s, family)),
    ...(r.careCredit ? { careCredit: { person: cleanText(r.careCredit.caregiverName, 20), amount: money(r.careCredit.creditCents) } } : {}),
  };
}

async function allReceipts(ctx: ToolContext): Promise<StoredReceipt[]> {
  return ctx.receipts.list();
}

function summary(receipts: StoredReceipt[], family: StoredFamily, from?: string, to?: string) {
  const inRange = receipts.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
  const people = new Map<string, { name: string; open: number; paid: number; cancelled: number; credit: number }>();
  const person = (id: string, fallback?: string) => {
    let p = people.get(id);
    if (!p) people.set(id, (p = { name: family.members.find((m) => m.id === id)?.name ?? fallback ?? 'Someone', open: 0, paid: 0, cancelled: 0, credit: 0 }));
    return p;
  };
  let spent = 0;
  let open = 0;
  let paid = 0;
  for (const r of inRange) {
    spent += r.totalCents;
    for (const s of r.shares) {
      const p = person(s.memberId, s.memberName);
      if (s.status === 'PAID') {
        p.paid += s.amountCents;
        paid += s.amountCents;
      } else if (s.status === 'CANCELLED') p.cancelled += s.amountCents;
      else {
        p.open += s.amountCents;
        open += s.amountCents;
      }
    }
    if (r.careCredit) person(r.careCredit.caregiverId, r.careCredit.caregiverName).credit += r.careCredit.creditCents;
  }
  return {
    period: { from: from ?? 'the beginning', to: to ?? 'today' },
    receipts: inRange.length,
    totalSpent: money(spent),
    stillOpen: money(open),
    paidBack: money(paid),
    perPerson: [...people.values()].map((p) => ({ person: cleanText(p.name, 20), stillOwes: money(p.open), hasPaid: money(p.paid), cancelledInvoices: money(p.cancelled), careCreditReceived: money(p.credit) })),
  };
}

/** Runs one tool call. Anything unexpected becomes a plain error the model can explain; nothing throws. */
export async function callTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const args = (typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}) as Record<string, unknown>;
  try {
    switch (name) {
      case 'get_summary': {
        const from = asString(args.from, 10);
        const to = asString(args.to, 10);
        if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return { result: { error: 'Dates must look like 2026-09-01.' } };
        return { result: summary(await allReceipts(ctx), ctx.family, from || undefined, to || undefined) };
      }
      case 'list_receipts': {
        const month = asString(args.month, 7);
        const status = asString(args.status, 12);
        if (month && !MONTH.test(month)) return { result: { error: 'The month must look like 2026-09.' } };
        if (status && !['open', 'paid', 'unsent', 'cancelled'].includes(status)) return { result: { error: 'Unknown status.' } };
        const list = (await allReceipts(ctx)).filter((r) => (!month || r.date.startsWith(month)) && (!status || groupOf(r) === status));
        return { result: { count: list.length, shownAtMost: 15, receipts: list.slice(0, 15).map((r) => receiptLine(r, ctx.family)) } };
      }
      case 'get_receipt': {
        const r = await ctx.receipts.get(asString(args.receiptId, 64));
        if (!r) return { result: { error: "I can't find that receipt in this family." } };
        return { result: { ...receiptLine(r, ctx.family), items: r.items.slice(0, 30).map((i) => ({ name: cleanText(i.name, 60), amount: money(i.lineTotalCents) })) } };
      }
      case 'who_owes': {
        const open = (await allReceipts(ctx)).flatMap((r) => r.shares.filter((s) => s.status === 'SENT' || s.status === 'DRAFT').map((s) => ({ r, s })));
        const byPerson = new Map<string, { name: string; cents: number; items: unknown[] }>();
        for (const { r, s } of open) {
          const line = shareLine(s, ctx.family);
          const entry = byPerson.get(s.memberId) ?? { name: line.person, cents: 0, items: [] };
          entry.cents += s.amountCents;
          entry.items.push({ receiptId: r.id, pharmacy: cleanText(r.merchant, 60), date: r.date, amount: line.amount, status: line.status, ...(r.sample ? { sampleReceipt: true } : {}) });
          byPerson.set(s.memberId, entry);
        }
        return { result: { people: [...byPerson.values()].map((p) => ({ person: p.name, owes: money(p.cents), openShares: p.items })), nobodyOwesAnything: byPerson.size === 0 } };
      }
      case 'refresh_statuses': {
        if (!ctx.refresh) return { result: { error: 'PayPal is not available right now, so statuses cannot be refreshed.' } };
        return { result: { message: await ctx.refresh(asString(args.receiptId, 64)) } };
      }
      case 'propose_reminder':
      case 'propose_mark_paid':
      case 'propose_cancel_invoice':
      case 'propose_send_invoices': {
        const input: ProposalInput = {
          kind: name === 'propose_reminder' ? 'reminder' : name === 'propose_mark_paid' ? 'mark_paid' : name === 'propose_cancel_invoice' ? 'cancel' : 'send_remaining',
          receiptId: asString(args.receiptId, 64),
          memberName: asString(args.memberName, 40),
          method: asString(args.method, 20),
          note: asString(args.note, 100),
        };
        const res = await proposeAction(ctx.action, input);
        if (!res.ok) return { result: { proposed: false, reason: res.error } };
        return {
          result: { proposed: true, title: res.action.title, note: 'A confirmation card is now shown to the organiser. Nothing has happened yet: it only happens if they press Confirm. Do not say it is done.' },
          action: res.action,
        };
      }
      default:
        return { result: { error: `There is no tool called ${cleanText(name, 40)}.` } };
    }
  } catch {
    return { result: { error: 'That did not work. Say so plainly and suggest using the buttons in the app.' } };
  }
}
