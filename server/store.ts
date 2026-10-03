// Where families and receipts live. Two implementations behind one interface: in memory (tests,
// and local development without Google Cloud) and Firestore (see firestore-store.ts).
import type { MemberId, ShareStatus } from '../shared/types';

export interface StoredMember {
  id: MemberId;
  name: string;
  role: 'organiser' | 'member';
  /** Which PayPal sandbox account receives this person's invoices (see sandboxAccounts). */
  accountId: string;
}

/** One visitor's demo family. The id is the visitor's private, unguessable id. */
export interface StoredFamily {
  id: string;
  name: string;
  members: StoredMember[];
  createdAt: string;
  /** Everything of this family is deleted after this moment (Firestore TTL, when enabled). */
  expireAt: string;
}

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
  /** True for the built-in sample history: no real PayPal invoice exists for it. */
  sample?: boolean;
  expireAt?: string;
}

/** The receipts of one family. */
export interface ReceiptStore {
  /** Newest receipt date first. */
  list(): Promise<StoredReceipt[]>;
  get(id: string): Promise<StoredReceipt | undefined>;
  /** Creates or replaces the whole receipt. */
  save(receipt: StoredReceipt): Promise<void>;
}

export interface Store {
  getFamily(familyId: string): Promise<StoredFamily | undefined>;
  saveFamily(family: StoredFamily): Promise<void>;
  receipts(familyId: string): ReceiptStore;
  /** Deletes every receipt of the family (used by "Reset demo"). */
  deleteReceipts(familyId: string): Promise<void>;
}

export function sortNewestFirst(receipts: StoredReceipt[]): StoredReceipt[] {
  return [...receipts].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function createMemoryStore(): Store {
  const families = new Map<string, StoredFamily>();
  const receipts = new Map<string, Map<string, StoredReceipt>>();
  const of = (familyId: string) => {
    let m = receipts.get(familyId);
    if (!m) receipts.set(familyId, (m = new Map()));
    return m;
  };
  return {
    async getFamily(id) {
      const f = families.get(id);
      return f ? structuredClone(f) : undefined;
    },
    async saveFamily(family) {
      families.set(family.id, structuredClone(family));
    },
    receipts(familyId) {
      return {
        async list() {
          return sortNewestFirst([...of(familyId).values()].map((r) => structuredClone(r)));
        },
        async get(id) {
          const r = of(familyId).get(id);
          return r ? structuredClone(r) : undefined;
        },
        async save(receipt) {
          of(familyId).set(receipt.id, structuredClone(receipt));
        },
      };
    },
    async deleteReceipts(familyId) {
      receipts.delete(familyId);
    },
  };
}
