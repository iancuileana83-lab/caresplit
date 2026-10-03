// The fictional demo family, plus three sample receipts used when the app runs without a database.
// The email addresses are PayPal *sandbox* test accounts (not real people, not secrets).
import { splitEqual } from '../shared/money';
import type { FamilyView, Member, MemberId, ShareStatus } from '../shared/types';
import type { StoredReceipt } from './store';

export const family: FamilyView = {
  name: 'The Rowan family',
  members: [
    { id: 'anna', name: 'Anna', role: 'organiser' },
    { id: 'ben', name: 'Ben', role: 'member' },
    { id: 'clara', name: 'Clara', role: 'member' },
  ],
};

/** Sandbox PayPal accounts the invoices are sent to. Server-side only. */
export const memberEmails: Record<MemberId, string> = {
  anna: 'sb-f0k74753183683@personal.example.com',
  ben: 'sb-cxgha53183684@personal.example.com',
  clara: 'sb-r1goj53183689@personal.example.com',
};

export function findMember(id: string): Member | undefined {
  return family.members.find((m) => m.id === id);
}

const memberIds = family.members.map((m) => m.id);

function sample(id: string, merchant: string, date: string, totalCents: number, statuses: Record<MemberId, ShareStatus>): StoredReceipt {
  const parts = splitEqual(totalCents, memberIds, 'anna');
  return {
    id,
    merchant,
    date,
    currency: 'USD',
    totalCents,
    payerId: 'anna',
    payerShareCents: parts.find((p) => p.memberId === 'anna')?.amountCents ?? 0,
    items: [],
    subtotalCents: null,
    discountCents: null,
    taxCents: null,
    // No invoice links: these samples were never sent through PayPal.
    shares: parts.filter((p) => p.memberId !== 'anna').map((p) => ({ memberId: p.memberId, amountCents: p.amountCents, status: statuses[p.memberId] ?? 'DRAFT' })),
    createdAt: `${date}T12:00:00.000Z`,
  };
}

export function sampleReceipts(): StoredReceipt[] {
  return [
    sample('r-green-leaf', 'Green Leaf Pharmacy', '2026-10-02', 3978, { ben: 'PAID', clara: 'SENT' }),
    sample('r-riverside', 'Riverside Pharmacy', '2026-09-28', 4449, { ben: 'PAID', clara: 'PAID' }),
    sample('r-sunrise', 'Sunrise Drugstore', '2026-09-25', 2638, { ben: 'PAID', clara: 'PAID' }),
  ];
}
