// Where receipts live. Two implementations behind one interface: in memory (tests, and local
// development without Google Cloud) and Firestore (see firestore-store.ts).
import type { MemberId, ShareStatus } from '../shared/types';

export interface StoredShare {
  memberId: MemberId;
  amountCents: number;
  status: ShareStatus;
  /** PayPal invoice id, saved as soon as the draft exists so a retry never creates a second one. */
  invoiceId?: string;
  invoiceUrl?: string;
  invoiceNumber?: string;
  sentAt?: string;
}

export interface StoredReceipt {
  id: string;
  merchant: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  currency: string;
  totalCents: number;
  payerId: MemberId;
  /** The organiser's own part, which is not invoiced. */
  payerShareCents: number;
  items: { name: string; quantity: number | null; lineTotalCents: number }[];
  subtotalCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  shares: StoredShare[];
  createdAt: string;
}

export interface ReceiptStore {
  /** Newest receipt date first. */
  list(): Promise<StoredReceipt[]>;
  get(id: string): Promise<StoredReceipt | undefined>;
  /** Creates or replaces the whole receipt. */
  save(receipt: StoredReceipt): Promise<void>;
}

export function sortNewestFirst(receipts: StoredReceipt[]): StoredReceipt[] {
  return [...receipts].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function createMemoryStore(initial: StoredReceipt[] = []): ReceiptStore {
  const map = new Map(initial.map((r) => [r.id, structuredClone(r)]));
  return {
    async list() {
      return sortNewestFirst([...map.values()].map((r) => structuredClone(r)));
    },
    async get(id) {
      const r = map.get(id);
      return r ? structuredClone(r) : undefined;
    },
    async save(receipt) {
      map.set(receipt.id, structuredClone(receipt));
    },
  };
}
