// Spike: does a PayPal sandbox invoice item accept a discount, and what total does PayPal calculate?
// Creates ONE draft invoice (never sent), reads it back, prints the numbers, and deletes the draft.
// Usage: npx tsx --env-file=.env spikes/paypal-discount.ts
import { createPayPalClient } from '../server/paypal';

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV } = process.env;
if (PAYPAL_ENV !== 'sandbox' || !PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error('Set PAYPAL_ENV=sandbox and the sandbox keys in .env');

const paypal = createPayPalClient({ clientId: PAYPAL_CLIENT_ID, clientSecret: PAYPAL_CLIENT_SECRET, merchantEmail: 'sb-swgwq53114117@business.example.com' });

const draft = await paypal.createDraft({
  requestId: `spike-discount-${Date.now()}`,
  recipientName: 'Ben',
  recipientEmail: 'sb-cxgha53183684@personal.example.com',
  itemName: 'Your share of the Spike receipt',
  itemDescription: 'Your normal share minus a $0.50 care credit for time spent helping',
  note: 'Spike: discount on an invoice item (never sent)',
  amountCents: 100,
  discountCents: 50,
});
console.log('draft id:', draft.id, '| status:', draft.status, '| total PayPal calculated (cents):', draft.totalCents, '(expected 50)');

// Read the raw invoice to see how the discount is shown.
const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
const tok = (await (await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })).json()) as { access_token: string };
const raw = (await (await fetch(`https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${draft.id}`, { headers: { Authorization: `Bearer ${tok.access_token}` } })).json()) as Record<string, any>;
console.log('item as stored:', JSON.stringify(raw.items?.[0]));
console.log('amount:', JSON.stringify(raw.amount));

const del = await fetch(`https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${draft.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok.access_token}` } });
console.log('draft deleted:', del.status);
