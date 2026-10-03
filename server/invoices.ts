// Creates and sends one PayPal invoice per sibling's share, safely: every step is saved before the
// next one starts, so a failure halfway (or a second click) never produces duplicate invoices.
import { formatUsd } from '../shared/money';
import { formatPercent } from '../shared/split';
import type { Member } from '../shared/types';
import { mapInvoiceStatus, type OutsideMethod, type PayPalClient } from './paypal';
import type { ReceiptStore, StoredReceipt, StoredShare } from './store';

export interface SendFailure {
  memberId: string;
  message: string;
}

export interface InvoiceDeps {
  store: ReceiptStore;
  paypal: PayPalClient;
  members: Member[];
  emailOf: (memberId: string) => string | undefined;
}

// One send at a time per receipt (double clicks, two browser tabs on the same server).
const running = new Map<string, Promise<unknown>>();

async function exclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = running.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  running.set(key, next);
  try {
    return await next;
  } finally {
    if (running.get(key) === next) running.delete(key);
  }
}

const needsSending = (s: StoredShare) => s.status === 'DRAFT' && s.amountCents > 0;

function describe(receipt: StoredReceipt, share: StoredShare, payerName: string) {
  const rule = receipt.splitRule;
  const care = receipt.careCredit;
  // The caregiver's invoice shows the normal share with the care credit taken off as a discount, so the
  // credit is visible on the invoice itself. The total they owe is still exactly their share.
  const discountCents = care && care.caregiverId === share.memberId ? care.creditCents : 0;
  const how =
    discountCents > 0
      ? `your normal share minus a ${formatUsd(discountCents)} care credit for time spent helping`
      : rule?.type === 'percent'
        ? `your part is ${formatPercent(rule.basisPoints[share.memberId] ?? 0)}% of the total${care ? ", which includes the family's care credit" : ''}`
        : 'split equally between the family members';
  return {
    itemName: `Your share of the ${receipt.merchant} receipt`,
    itemDescription: `Receipt dated ${receipt.date}, total ${formatUsd(receipt.totalCents)}, ${how}, paid at the pharmacy by ${payerName}.`,
    note: 'CareSplit demo: fictional data, PayPal sandbox. Amounts and dates only.',
    amountCents: share.amountCents + discountCents,
    ...(discountCents > 0 ? { discountCents } : {}),
  };
}

/** Sends every invoice that has not been sent yet. Returns the saved receipt and any failures. */
export function sendInvoices(receiptId: string, deps: InvoiceDeps): Promise<{ receipt: StoredReceipt; failed: SendFailure[] }> {
  return exclusive(receiptId, async () => {
    const receipt = await deps.store.get(receiptId);
    if (!receipt) throw new Error('Receipt not found');
    const payerName = deps.members.find((m) => m.id === receipt.payerId)?.name ?? 'the organiser';
    const failed: SendFailure[] = [];

    for (const share of receipt.shares) {
      if (!needsSending(share)) continue;
      const member = deps.members.find((m) => m.id === share.memberId);
      const email = deps.emailOf(share.memberId);
      if (!member || !email) {
        failed.push({ memberId: share.memberId, message: 'No PayPal address for this person' });
        continue;
      }
      try {
        if (!share.invoiceId) {
          const draft = await deps.paypal.createDraft({
            requestId: `caresplit-${receipt.id}-${share.memberId}`,
            recipientName: member.name,
            recipientEmail: email,
            ...describe(receipt, share, payerName),
          });
          // Never send an invoice whose total is not exactly this share (for example if PayPal ignored a discount).
          if (draft.totalCents !== undefined && draft.totalCents !== share.amountCents) {
            throw new Error(`PayPal calculated an invoice total of ${formatUsd(draft.totalCents)} instead of ${formatUsd(share.amountCents)}, so it was not sent`);
          }
          share.invoiceId = draft.id;
          share.invoiceNumber = draft.number;
          await deps.store.save(receipt); // remember the draft before anything else can go wrong
        }
        await deps.paypal.send(share.invoiceId);
        const info = await deps.paypal.get(share.invoiceId);
        share.status = mapInvoiceStatus(info.status);
        share.invoiceUrl = info.recipientViewUrl;
        share.invoiceNumber = info.number ?? share.invoiceNumber;
        share.sentAt = new Date().toISOString();
        await deps.store.save(receipt);
      } catch (err) {
        failed.push({ memberId: share.memberId, message: err instanceof Error ? err.message : 'Sending failed' });
      }
    }
    return { receipt: (await deps.store.get(receiptId)) ?? receipt, failed };
  });
}

/** Something the organiser asked for that cannot be done in the share's current state. */
export class ShareActionError extends Error {
  constructor(
    message: string,
    public status: 404 | 409,
  ) {
    super(message);
  }
}

/**
 * Loads the receipt and the one share an action is about, and checks the share's invoice is
 * really still open in PayPal (the family may have paid it a moment ago). If PayPal says it is
 * already paid or cancelled, the saved share is brought up to date and the action is refused.
 */
async function openShare(receiptId: string, memberId: string, verb: string, deps: InvoiceDeps) {
  const receipt = await deps.store.get(receiptId);
  const share = receipt?.shares.find((s) => s.memberId === memberId);
  if (!receipt || !share) throw new ShareActionError('Receipt or person not found', 404);
  if (share.status !== 'SENT' || !share.invoiceId) {
    throw new ShareActionError(`Only an invoice that was sent and is still unpaid can be ${verb}.`, 409);
  }
  const info = await deps.paypal.get(share.invoiceId);
  const live = mapInvoiceStatus(info.status);
  if (live !== 'SENT') {
    share.status = live;
    await deps.store.save(receipt);
    throw new ShareActionError(live === 'PAID' ? `This invoice has already been paid, so it can't be ${verb}. The receipt now shows it as paid.` : `This invoice is no longer open (${live.toLowerCase()}). The receipt now shows its real state.`, 409);
  }
  return { receipt, share, invoiceId: share.invoiceId };
}

/** Withdraws one sibling's sent, unpaid invoice. */
export function cancelInvoice(receiptId: string, memberId: string, deps: InvoiceDeps): Promise<StoredReceipt> {
  return exclusive(receiptId, async () => {
    const { receipt, share, invoiceId } = await openShare(receiptId, memberId, 'cancelled', deps);
    await deps.paypal.cancel(invoiceId, `This invoice for ${share.memberName ?? 'you'} was cancelled by the organiser.`);
    share.status = 'CANCELLED';
    await deps.store.save(receipt);
    return receipt;
  });
}

/** Records that one sibling paid their share outside PayPal (cash, bank transfer...). */
export function markPaidOutside(receiptId: string, memberId: string, input: { method: OutsideMethod; note?: string }, deps: InvoiceDeps, now = new Date()): Promise<StoredReceipt> {
  return exclusive(receiptId, async () => {
    const { receipt, share, invoiceId } = await openShare(receiptId, memberId, 'marked as paid', deps);
    await deps.paypal.recordPayment(invoiceId, { method: input.method, note: input.note, amountCents: share.amountCents, date: now.toISOString().slice(0, 10) });
    share.status = 'PAID';
    share.paidOutside = { method: input.method, ...(input.note ? { note: input.note } : {}), at: now.toISOString() };
    await deps.store.save(receipt);
    return receipt;
  });
}

/** Reads each invoice's status from PayPal and saves what changed. */
export function refreshStatuses(receiptId: string, deps: InvoiceDeps): Promise<{ receipt: StoredReceipt; failed: SendFailure[] }> {
  return exclusive(receiptId, async () => {
    const receipt = await deps.store.get(receiptId);
    if (!receipt) throw new Error('Receipt not found');
    const failed: SendFailure[] = [];
    let changed = false;
    for (const share of receipt.shares) {
      if (!share.invoiceId || share.status === 'CANCELLED') continue;
      try {
        const info = await deps.paypal.get(share.invoiceId);
        const status = mapInvoiceStatus(info.status);
        if (status !== share.status || (info.recipientViewUrl && info.recipientViewUrl !== share.invoiceUrl)) {
          share.status = status;
          share.invoiceUrl = info.recipientViewUrl ?? share.invoiceUrl;
          changed = true;
        }
      } catch (err) {
        failed.push({ memberId: share.memberId, message: err instanceof Error ? err.message : 'Could not read the invoice' });
      }
    }
    if (changed) await deps.store.save(receipt);
    return { receipt, failed };
  });
}
