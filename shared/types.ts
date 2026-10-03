// Types shared by the server and the web app. All money is integer US cents.

export type MemberId = string;

export interface Member {
  id: MemberId;
  name: string;
  role: 'organiser' | 'member';
}

export type ShareStatus = 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED';

/** One sibling's part of a receipt, paid through one PayPal invoice. */
export interface Share {
  memberId: MemberId;
  amountCents: number;
  status: ShareStatus;
  invoiceUrl?: string;
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
}

export interface FamilyView {
  name: string;
  members: Member[];
}
