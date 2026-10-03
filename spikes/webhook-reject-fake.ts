// Spike: does the REAL PayPal sandbox reject a webhook call with a made-up signature?
// Builds the app with the real PayPal client and sends it a forged event. Changes nothing anywhere.
// Usage: npx tsx --env-file=.env spikes/webhook-reject-fake.ts
import { buildApp } from '../server/app';
import { paypalFromEnv } from '../server/paypal';
import { createMemoryStore } from '../server/store';

const paypal = paypalFromEnv(process.env);
if (!paypal) throw new Error('Set PAYPAL_ENV=sandbox and the sandbox keys in .env');

const app = await buildApp({ store: createMemoryStore(), paypal, webhookId: process.env.PAYPAL_WEBHOOK_ID || 'FAKEWEBHOOKID0000' });
const forged = JSON.stringify({ id: 'WH-FORGED', event_type: 'INVOICING.INVOICE.PAID', resource: { invoice: { id: 'INV2-AAAA-BBBB-CCCC-DDDD' } } });
const res = await app.inject({
  method: 'POST',
  url: '/api/paypal/webhook',
  headers: {
    'content-type': 'application/json',
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-1d93a270',
    'paypal-transmission-id': 'forged-transmission-id',
    'paypal-transmission-sig': 'Zm9yZ2Vk',
    'paypal-transmission-time': new Date().toISOString(),
  },
  payload: forged,
});
console.log('forged call ->', res.statusCode, res.body, '(expected 401: PayPal does not confirm the signature)');
