// The fictional demo family every visitor starts with, the PayPal sandbox accounts it can use,
// and a short sample history. Nothing here is a real person.
import { splitEqual } from '../shared/money';
import type { MemberId, ShareStatus } from '../shared/types';
import type { StoredFamily, StoredReceipt } from './store';

/** How long a visitor's demo family lives before it is deleted (when the TTL policy is on). */
export const FAMILY_TTL_DAYS = 7;

export interface SandboxAccount {
  id: string;
  /** Shown in the app instead of the address. */
  label: string;
  /** PayPal sandbox Personal account that receives the invoices. Server-side only. */
  email: string;
}

/** The only addresses an invoice can ever be sent to: fictional PayPal sandbox buyer accounts. */
export const sandboxAccounts: SandboxAccount[] = [
  { id: 'buyer-a', label: 'Sandbox buyer A', email: 'sb-f0k74753183683@personal.example.com' },
  { id: 'buyer-b', label: 'Sandbox buyer B', email: 'sb-cxgha53183684@personal.example.com' },
  { id: 'buyer-c', label: 'Sandbox buyer C', email: 'sb-r1goj53183689@personal.example.com' },
  { id: 'buyer-d', label: 'Sandbox buyer D', email: 'sb-mltzy53187091@personal.example.com' },
];

export function accountEmail(accountId: string | undefined): string | undefined {
  return sandboxAccounts.find((a) => a.id === accountId)?.email;
}

const dayMs = 24 * 60 * 60 * 1000;

export function newFamily(id: string, now: Date): StoredFamily {
  return {
    id,
    name: 'The Rowan family',
    members: [
      { id: 'anna', name: 'Anna', role: 'organiser', accountId: 'buyer-a' },
      { id: 'ben', name: 'Ben', role: 'member', accountId: 'buyer-b' },
      { id: 'clara', name: 'Clara', role: 'member', accountId: 'buyer-c' },
    ],
    splitRule: { type: 'equal' },
    createdAt: now.toISOString(),
    expireAt: new Date(now.getTime() + FAMILY_TTL_DAYS * dayMs).toISOString(),
  };
}

const isoDay = (now: Date, daysAgo: number) => new Date(now.getTime() - daysAgo * dayMs).toISOString().slice(0, 10);

function sample(
  family: StoredFamily,
  now: Date,
  slug: string,
  merchant: string,
  daysAgo: number,
  totalCents: number,
  statuses: Record<MemberId, ShareStatus>,
): StoredReceipt {
  const organiser = family.members.find((m) => m.role === 'organiser')!;
  const parts = splitEqual(totalCents, family.members.map((m) => m.id), organiser.id);
  const date = isoDay(now, daysAgo);
  return {
    id: `sample-${slug}`, // fixed ids, so seeding twice (two tabs at once) cannot make duplicates
    merchant,
    date,
    currency: 'USD',
    totalCents,
    payerId: organiser.id,
    payerShareCents: parts.find((p) => p.memberId === organiser.id)?.amountCents ?? 0,
    items: [],
    subtotalCents: null,
    discountCents: null,
    taxCents: null,
    // No invoice links: the samples were never sent through PayPal.
    shares: parts
      .filter((p) => p.memberId !== organiser.id)
      .map((p) => ({ memberId: p.memberId, memberName: family.members.find((m) => m.id === p.memberId)?.name, amountCents: p.amountCents, status: statuses[p.memberId] ?? 'DRAFT' })),
    createdAt: `${date}T12:00:00.000Z`,
    sample: true,
    splitRule: { type: 'equal' },
    expireAt: family.expireAt,
  };
}

/** Three fictional receipts from the last ten days, so a new visitor sees a lived-in app. */
export function seedReceipts(family: StoredFamily, now: Date): StoredReceipt[] {
  return [
    sample(family, now, 'green-leaf', 'Green Leaf Pharmacy', 1, 3978, { ben: 'PAID', clara: 'SENT' }),
    sample(family, now, 'riverside', 'Riverside Pharmacy', 5, 4449, { ben: 'PAID', clara: 'PAID' }),
    sample(family, now, 'sunrise', 'Sunrise Drugstore', 8, 2638, { ben: 'PAID', clara: 'PAID' }),
  ];
}
