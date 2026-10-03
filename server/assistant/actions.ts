// The assistant never changes anything itself. It can only PROPOSE an action; the proposal is checked against the real
// state and stored as a pending action; only the organiser's Confirm (a normal button call) runs it, once.
import { randomUUID } from 'node:crypto';
import { formatUsd } from '../../shared/money';
import { cancelInvoice, markPaidOutside, REMINDER_COOLDOWN_MS, reminderMessage, sendInvoices, sendReminder, ShareActionError, type InvoiceDeps } from '../invoices';
import { OUTSIDE_METHODS, PayPalError, type OutsideMethod } from '../paypal';
import type { ActionKind, PendingAction, ReceiptStore, Store, StoredFamily, StoredReceipt, StoredShare } from '../store';
import { cleanText } from '../text';

/** A proposal must be confirmed within this time, or it expires. */
export const CONFIRM_WINDOW_MS = 5 * 60 * 1000;
const MAX_PENDING = 10;
const METHOD_LABELS: Record<OutsideMethod, string> = { CASH: 'cash', BANK_TRANSFER: 'bank transfer', OTHER: 'another way' };

export interface ActionContext {
  store: Store;
  family: StoredFamily;
  /** The receipts of this family only. */
  receipts: ReceiptStore;
  now?: () => Date;
}

export interface ProposalInput {
  kind: ActionKind;
  receiptId: string;
  /** The first name of the person the action is about, as the organiser says it. */
  memberName?: string;
  method?: string;
  note?: string;
}

export type ProposalResult = { ok: true; action: PendingAction; reused: boolean } | { ok: false; error: string };

const clock = (ctx: ActionContext) => (ctx.now ?? (() => new Date()))();

/** The share of the person called `name` on this receipt: by their current name, or the name the receipt kept. */
function shareFor(receipt: StoredReceipt, family: StoredFamily, name: string): { share: StoredShare; name: string } | undefined {
  const wanted = cleanText(name, 40).toLowerCase();
  if (!wanted) return undefined;
  const member = family.members.find((m) => m.name.toLowerCase() === wanted);
  const share = member ? receipt.shares.find((s) => s.memberId === member.id) : receipt.shares.find((s) => (s.memberName ?? '').toLowerCase() === wanted);
  return share ? { share, name: member?.name ?? share.memberName ?? name } : undefined;
}

const sameProposal = (a: PendingAction, b: Pick<PendingAction, 'kind' | 'receiptId' | 'memberId' | 'params'>) =>
  a.kind === b.kind && a.receiptId === b.receiptId && a.memberId === b.memberId && a.params?.method === b.params?.method && a.params?.note === b.params?.note;

/** Checks a proposal against the real receipt and, if it makes sense, stores it as a pending action. */
export async function proposeAction(ctx: ActionContext, input: ProposalInput): Promise<ProposalResult> {
  const now = clock(ctx);
  if (typeof input.receiptId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(input.receiptId)) return { ok: false, error: 'I need a receipt id from the list of receipts.' };
  const receipt = await ctx.receipts.get(input.receiptId);
  if (!receipt) return { ok: false, error: "I can't find that receipt in this family." };
  if (receipt.sample) return { ok: false, error: 'That is a sample receipt: it has no PayPal invoices.' };

  const line = `Receipt: ${cleanText(receipt.merchant, 60)}, ${receipt.date}`;
  let candidate: Pick<PendingAction, 'kind' | 'receiptId' | 'memberId' | 'params' | 'title' | 'lines'>;

  if (input.kind === 'send_remaining') {
    const unsent = receipt.shares.filter((s) => s.status === 'DRAFT' && s.amountCents > 0);
    if (unsent.length === 0) return { ok: false, error: 'Every invoice on that receipt has already been sent.' };
    candidate = {
      kind: 'send_remaining',
      receiptId: receipt.id,
      title: `Send ${unsent.length} PayPal invoice${unsent.length === 1 ? '' : 's'}`,
      lines: [line, ...unsent.map((s) => `${cleanText(s.memberName, 20)}: ${formatUsd(s.amountCents)}`), 'Effect: PayPal emails each person their invoice (sandbox, no real money).'],
    };
  } else {
    const found = shareFor(receipt, ctx.family, input.memberName ?? '');
    if (!found) return { ok: false, error: `I can't find ${cleanText(input.memberName, 20) || 'that person'} on that receipt.` };
    const { share, name } = found;
    const who = cleanText(name, 20);
    if (share.status === 'PAID') return { ok: false, error: `${who}'s share on that receipt is already paid.` };
    if (share.status === 'CANCELLED') return { ok: false, error: `${who}'s invoice on that receipt was cancelled.` };
    if (share.status === 'DRAFT' || !share.invoiceId) return { ok: false, error: `${who}'s invoice on that receipt has not been sent yet. Send it first.` };

    const amount = formatUsd(share.amountCents);
    if (input.kind === 'reminder') {
      if (share.reminderSentAt && now.getTime() - Date.parse(share.reminderSentAt) < REMINDER_COOLDOWN_MS) {
        return { ok: false, error: `A reminder for ${who}'s invoice was already sent in the last 24 hours.` };
      }
      const message = reminderMessage(receipt, share, who).note;
      candidate = {
        kind: 'reminder',
        receiptId: receipt.id,
        memberId: share.memberId,
        params: { message },
        title: `Send ${who} a reminder`,
        lines: [line, `Amount: ${amount}`, `Message: "${message}"`, `Effect: PayPal emails ${who} this reminder. The invoice stays open.`],
      };
    } else if (input.kind === 'mark_paid') {
      const method = OUTSIDE_METHODS.find((m) => m === input.method);
      if (!method) return { ok: false, error: 'Ask how it was paid: cash, bank transfer or another way.' };
      const note = cleanText(input.note, 100) || undefined;
      candidate = {
        kind: 'mark_paid',
        receiptId: receipt.id,
        memberId: share.memberId,
        params: { method, ...(note ? { note } : {}) },
        title: `Mark ${who}'s share as paid`,
        lines: [line, `Amount: ${amount}`, `Paid by: ${METHOD_LABELS[method]}`, ...(note ? [`Note: ${note}`] : []), "Effect: PayPal records the payment on the invoice. This can't be undone."],
      };
    } else if (input.kind === 'cancel') {
      candidate = {
        kind: 'cancel',
        receiptId: receipt.id,
        memberId: share.memberId,
        title: `Cancel ${who}'s invoice`,
        lines: [line, `Amount: ${amount}`, `Effect: PayPal withdraws the invoice and tells ${who}. This can't be undone.`],
      };
    } else {
      return { ok: false, error: 'That is not something I can do.' };
    }
  }

  // The same proposal twice is one card; and there is a limit on how many wait at once.
  const recent = await ctx.store.listActions(ctx.family.id, 30);
  const waiting = recent.filter((a) => a.status === 'pending' && Date.parse(a.confirmBy) > now.getTime());
  const twin = waiting.find((a) => sameProposal(a, candidate));
  if (twin) return { ok: true, action: twin, reused: true };
  if (waiting.length >= MAX_PENDING) return { ok: false, error: 'Too many actions are waiting for confirmation. Confirm or dismiss some first.' };

  const action: PendingAction = {
    id: randomUUID(),
    ...candidate,
    status: 'pending',
    createdAt: now.toISOString(),
    confirmBy: new Date(now.getTime() + CONFIRM_WINDOW_MS).toISOString(),
    expireAt: ctx.family.expireAt,
  };
  await ctx.store.saveAction(ctx.family.id, action);
  return { ok: true, action, reused: false };
}

export interface ConfirmOutcome {
  /** 200 with the action's final state (done or failed), or an error code. */
  http: 200 | 404 | 409 | 410;
  action?: PendingAction;
  error?: string;
}

/** Runs a pending action once, after the organiser pressed Confirm. Repeating it returns the same outcome. */
export async function confirmAction(ctx: ActionContext, actionId: string, deps: InvoiceDeps): Promise<ConfirmOutcome> {
  const now = clock(ctx);
  const action = await ctx.store.getAction(ctx.family.id, actionId);
  if (!action) return { http: 404, error: 'That action was not found.' };
  if (action.status === 'done' || action.status === 'failed') return { http: 200, action }; // already run: show what happened
  if (action.status === 'running') return { http: 409, action, error: 'That action is already being carried out.' };
  if (action.status === 'dismissed') return { http: 409, action, error: 'That action was dismissed.' };
  if (action.status === 'expired' || Date.parse(action.confirmBy) <= now.getTime()) {
    const expired: PendingAction = { ...action, status: 'expired', finishedAt: now.toISOString() };
    await ctx.store.saveAction(ctx.family.id, expired);
    return { http: 410, action: expired, error: 'That action took too long to confirm. Ask again.' };
  }

  await ctx.store.saveAction(ctx.family.id, { ...action, status: 'running' });
  let outcome: Pick<PendingAction, 'status' | 'result'>;
  try {
    outcome = await run(action, deps, now);
  } catch (err) {
    outcome = { status: 'failed', result: failureText(err) };
  }
  const finished: PendingAction = { ...action, ...outcome, finishedAt: clock(ctx).toISOString() };
  await ctx.store.saveAction(ctx.family.id, finished);
  return { http: 200, action: finished };
}

async function run(action: PendingAction, deps: InvoiceDeps, now: Date): Promise<Pick<PendingAction, 'status' | 'result'>> {
  const name = deps.members.find((m) => m.id === action.memberId)?.name ?? 'the person';
  switch (action.kind) {
    case 'reminder':
      await sendReminder(action.receiptId, action.memberId!, deps, now);
      return { status: 'done', result: `Reminder sent to ${name} through PayPal.` };
    case 'mark_paid': {
      const method = action.params?.method ?? 'OTHER';
      await markPaidOutside(action.receiptId, action.memberId!, { method, note: action.params?.note }, deps);
      return { status: 'done', result: `${name}'s share is marked as paid (${METHOD_LABELS[method]}).` };
    }
    case 'cancel':
      await cancelInvoice(action.receiptId, action.memberId!, deps);
      return { status: 'done', result: `${name}'s invoice was cancelled.` };
    case 'send_remaining': {
      const before = (await deps.store.get(action.receiptId))?.shares.filter((s) => s.status === 'DRAFT').length ?? 0;
      const { receipt, failed } = await sendInvoices(action.receiptId, deps);
      const sent = before - receipt.shares.filter((s) => s.status === 'DRAFT').length;
      const problems = failed.map((f) => `${deps.members.find((m) => m.id === f.memberId)?.name ?? 'Someone'}: ${f.message}`);
      if (sent === 0) return { status: 'failed', result: `No invoice was sent. ${problems.join('; ')}`.trim() };
      return { status: 'done', result: `Sent ${sent} invoice${sent === 1 ? '' : 's'}.${problems.length ? ` Not sent: ${problems.join('; ')}` : ''}` };
    }
  }
}

function failureText(err: unknown): string {
  if (err instanceof ShareActionError) return err.message;
  if (err instanceof PayPalError) return `PayPal could not do that right now (${cleanText(err.message, 120)}). Nothing was changed.`;
  return 'Something went wrong, and nothing was changed.';
}

/** The organiser chose not to do it. */
export async function dismissAction(ctx: ActionContext, actionId: string): Promise<ConfirmOutcome> {
  const action = await ctx.store.getAction(ctx.family.id, actionId);
  if (!action) return { http: 404, error: 'That action was not found.' };
  if (action.status !== 'pending') return { http: 200, action };
  const dismissed: PendingAction = { ...action, status: 'dismissed', finishedAt: clock(ctx).toISOString(), result: 'Dismissed.' };
  await ctx.store.saveAction(ctx.family.id, dismissed);
  return { http: 200, action: dismissed };
}
