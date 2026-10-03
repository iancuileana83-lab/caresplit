// Creates and sends one PayPal invoice per sibling's share, safely: every step is saved before the
// next one starts, so a failure halfway (or a second click) never produces duplicate invoices.
import { formatUsd } from '../shared/money';
import type { Member } from '../shared/types';
import { mapInvoiceStatus, type PayPalClient } from './paypal';
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
  const parts = receipt.shares.length + 1;
  return {
    itemName: `Your share of the ${receipt.merchant} receipt`,
    itemDescription: `Receipt dated ${receipt.date}, total ${formatUsd(receipt.totalCents)}, split equally between ${parts} people and paid at the pharmacy by ${payerName}.`,
    note: 'CareSplit demo: fictional data, PayPal sandbox. Amounts and dates only.',
    amountCents: share.amountCents,
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
