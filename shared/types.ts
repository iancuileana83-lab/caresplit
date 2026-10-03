// Types shared by the server and the web app. All money is integer US cents.
import type { CareCredit } from './care';
import type { SplitRule } from './split';

export type MemberId = string;

export interface Member {
  id: MemberId;
  name: string;
  role: 'organiser' | 'member';
}

/** A member as the family screen edits them: which sandbox PayPal account gets their invoices. */
export interface EditableMember extends Member {
  accountId: string;
}

/** A PayPal sandbox account a member can be linked to. The address itself never leaves the server. */
export interface SandboxAccountView {
  id: string;
  label: string;
}

export type ShareStatus = 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED';

/** One sibling's part of a receipt, paid through one PayPal invoice. */
export interface Share {
  memberId: MemberId;
  /** The member's name when the receipt was made, so it still reads well if the member is renamed or removed. */
  name?: string;
  amountCents: number;
  status: ShareStatus;
  invoiceUrl?: string;
  /** Present when the organiser recorded a payment made outside PayPal. */
  paidOutside?: { method: 'CASH' | 'BANK_TRANSFER' | 'OTHER'; note?: string };
  /** When a PayPal webhook last updated this status by itself (ISO time). Absent if it was never updated that way. */
  autoUpdatedAt?: string;
  /** When the last payment reminder was sent (ISO time), if any. */
  lastReminderAt?: string;
}

/**
 * A receipt as one family member is allowed to see it. The organiser sees the total and
 * every share; a sibling sees only their own share (no total, no one else's amount).
 */
export interface ReceiptView {
  id: string;
  merchant: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  payerId: MemberId;
  totalCents?: number;
  /** The organiser's own part (not invoiced). Only sent to the organiser. */
  payerShareCents?: number;
  shares: Share[];
  /** Part of the built-in sample history: no real PayPal invoice exists for it. */
  sample?: boolean;
  /** How this receipt was split (with the care credit already in it). Only sent to the organiser. */
  splitRule?: SplitRule;
  /** Set when a care credit was applied to this receipt. Sent to the organiser and to the caregiver. */
  careCredit?: ReceiptCareCredit;
}

/** The care credit that was applied to one receipt. */
export interface ReceiptCareCredit {
  caregiverId: MemberId;
  caregiverName: string;
  /** The credit percentage that was in force, in basis points. */
  basisPoints: number;
  /** How much less the caregiver's share is than their normal share, in cents. */
  creditCents: number;
}

export interface FamilyView {
  name: string;
  members: EditableMember[];
  /** The way new receipts are split unless the organiser chooses otherwise for one receipt. */
  splitRule: SplitRule;
  /** The family's care credit for the main caregiver, or null when there is none. */
  careCredit: CareCredit | null;
  /** The accounts members can be linked to (2 to 4 members, one account each). */
  accounts: SandboxAccountView[];
}

export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 4;
