// Spike: does the PayPal sandbox accept an invoice reminder, and does the invoice stay sent and unpaid?
// Creates ONE small invoice to a fictional sandbox buyer, sends it, sends a reminder, reads it back, then cancels it.
// Usage: npx tsx --env-file=.env spikes/paypal-remind.ts
import { createPayPalClient } from '../server/paypal';

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV } = process.env;
if (PAYPAL_ENV !== 'sandbox' || !PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error('Set PAYPAL_ENV=sandbox and the sandbox keys in .env');
const paypal = createPayPalClient({ clientId: PAYPAL_CLIENT_ID, clientSecret: PAYPAL_CLIENT_SECRET, merchantEmail: 'sb-swgwq53114117@business.example.com' });

const draft = await paypal.createDraft({
  requestId: `spike-remind-${Date.now()}`,
  recipientName: 'Ben',
  recipientEmail: 'sb-cxgha53183684@personal.example.com',
  itemName: 'Spike: reminder test',
  itemDescription: 'A tiny invoice used to test reminders (cancelled right after)',
  note: 'Spike: reminder test',
  amountCents: 10,
});
console.log('draft:', draft.id, draft.status);
await paypal.send(draft.id);
console.log('sent:', (await paypal.get(draft.id)).status);

try {
  await paypal.remind(draft.id, { subject: 'A friendly reminder', note: 'Hi Ben, a friendly reminder about your share. Thank you!' });
  console.log('reminder accepted by PayPal');
} catch (err) {
  console.log('reminder REFUSED:', err instanceof Error ? err.message : err, (err as { status?: number }).status);
}
console.log('after the reminder:', (await paypal.get(draft.id)).status, '(should still be SENT)');

try {
  await paypal.remind(draft.id, { subject: 'Second reminder', note: 'Again, right away' });
  console.log('a second reminder right away was also accepted');
} catch (err) {
  console.log('a second reminder right away was refused:', err instanceof Error ? err.message : err, (err as { status?: number }).status);
}

await paypal.cancel(draft.id, 'Spike finished');
console.log('cancelled:', (await paypal.get(draft.id)).status);
