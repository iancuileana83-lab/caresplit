// Registers the CareSplit invoice webhook in the PayPal SANDBOX through the API (no dashboard needed).
// 1. lists existing webhooks of this app, 2. reuses one with the same URL or creates it,
// 3. writes the webhook id into .env as PAYPAL_WEBHOOK_ID. The id is never printed.
// Usage: node --env-file=.env spikes/webhook-register.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const URL_TO_REGISTER = 'https://caresplit-30747896454.europe-west4.run.app/api/paypal/webhook';
const EVENTS = ['INVOICING.INVOICE.PAID', 'INVOICING.INVOICE.CANCELLED', 'INVOICING.INVOICE.REFUNDED', 'INVOICING.INVOICE.UPDATED'];
const BASE = 'https://api-m.sandbox.paypal.com';

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV } = process.env;
if (PAYPAL_ENV !== 'sandbox' || !PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error('Set PAYPAL_ENV=sandbox and the sandbox keys in .env');

const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
const tokenRes = await fetch(`${BASE}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
if (!tokenRes.ok) throw new Error(`sign-in failed (${tokenRes.status})`);
const auth = { Authorization: `Bearer ${(await tokenRes.json()).access_token}`, 'Content-Type': 'application/json' };

const list = await fetch(`${BASE}/v1/notifications/webhooks`, { headers: auth });
const listJson = await list.json();
if (!list.ok) throw new Error(`could not list webhooks: ${list.status} ${listJson.name ?? ''} ${listJson.message ?? ''}`);
const existing = listJson.webhooks ?? [];
console.log(`webhooks already registered for this app: ${existing.length}`);
for (const w of existing) console.log(`  - ${w.url} | events: ${(w.event_types ?? []).map((e) => e.name).join(', ')}`);

let hook = existing.find((w) => w.url === URL_TO_REGISTER);
if (hook) {
  console.log('a webhook with this URL already exists: reusing it, not creating a second one');
  const have = new Set((hook.event_types ?? []).map((e) => e.name));
  const missing = EVENTS.filter((e) => !have.has(e));
  const extra = [...have].filter((e) => !EVENTS.includes(e));
  console.log(`  missing events: ${missing.join(', ') || 'none'} | extra events: ${extra.join(', ') || 'none'}`);
  if (missing.length || extra.length) {
    const patch = await fetch(`${BASE}/v1/notifications/webhooks/${hook.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify([{ op: 'replace', path: '/event_types', value: EVENTS.map((name) => ({ name })) }]) });
    if (!patch.ok) throw new Error(`could not fix the event list: ${patch.status}`);
    hook = await patch.json();
    console.log('  event list set to exactly the four invoice events');
  }
} else {
  const create = await fetch(`${BASE}/v1/notifications/webhooks`, { method: 'POST', headers: auth, body: JSON.stringify({ url: URL_TO_REGISTER, event_types: EVENTS.map((name) => ({ name })) }) });
  const created = await create.json();
  if (!create.ok) throw new Error(`could not create the webhook: ${create.status} ${created.name ?? ''} ${created.message ?? ''} ${JSON.stringify(created.details ?? '')}`);
  hook = created;
  console.log('webhook created');
}

console.log('registered events:', (hook.event_types ?? []).map((e) => e.name).join(', '));
if (!hook.id) throw new Error('PayPal did not return a webhook id');

let env = readFileSync('.env', 'utf8');
if (/^PAYPAL_WEBHOOK_ID=/m.test(env)) env = env.replace(/^PAYPAL_WEBHOOK_ID=.*$/m, `PAYPAL_WEBHOOK_ID=${hook.id}`);
else env += `${env.endsWith('\n') ? '' : '\n'}PAYPAL_WEBHOOK_ID=${hook.id}\n`;
writeFileSync('.env', env);
console.log(`PAYPAL_WEBHOOK_ID written to .env (${hook.id.length} characters, not shown)`);
