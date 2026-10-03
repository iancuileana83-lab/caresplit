// Phase 0 spike: read a sandbox invoice's status and payments; optionally delete a DRAFT.
// Usage: node --env-file=.env spikes/paypal-invoice-status.mjs <invoiceId> [--delete-draft <draftId>]
// Never prints the token, client ID or secret.
const BASE = 'https://api-m.sandbox.paypal.com';
const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV } = process.env;
if (PAYPAL_ENV !== 'sandbox') throw new Error('PAYPAL_ENV must be "sandbox"');

const args = process.argv.slice(2);
const id = args[0];
const draftId = args.includes('--delete-draft') ? args[args.indexOf('--delete-draft') + 1] : undefined;

const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
const tr = await fetch(`${BASE}/v1/oauth2/token`, {
  method: 'POST',
  headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
});
const tj = await tr.json();
if (!tr.ok) throw new Error(`token failed: ${tr.status}`);
const auth = { Authorization: `Bearer ${tj.access_token}`, 'Content-Type': 'application/json' };

if (draftId) {
  const d = await fetch(`${BASE}/v2/invoicing/invoices/${draftId}`, { headers: auth });
  const dj = await d.json();
  if (dj.status === 'DRAFT') {
    const del = await fetch(`${BASE}/v2/invoicing/invoices/${draftId}`, { method: 'DELETE', headers: auth });
    console.log(`deleted draft ${draftId}:`, del.status);
  } else {
    console.log(`not deleting ${draftId}: status is ${dj.status}`);
  }
}

if (id && args.includes('--record-payment')) {
  // Records an external payment on the invoice (Invoicing "record payment" API).
  const i = args.indexOf('--record-payment');
  const value = args[i + 1];
  const note = args[i + 2];
  const rec = await fetch(`${BASE}/v2/invoicing/invoices/${id}/payments`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      method: 'PAYPAL',
      payment_date: new Date().toISOString().slice(0, 10),
      note,
      amount: { currency_code: 'USD', value },
    }),
  });
  console.log('record payment  :', rec.status, await rec.text());
}

if (id) {
  const res = await fetch(`${BASE}/v2/invoicing/invoices/${id}`, { headers: auth });
  const inv = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(inv)}`);
  console.log('status          :', inv.status);
  console.log('invoice total   :', inv.amount?.value, inv.amount?.currency_code);
  console.log('paid amount     :', inv.payments?.paid_amount?.value ?? '(none)', inv.payments?.paid_amount?.currency_code ?? '');
  console.log('due amount      :', inv.due_amount?.value, inv.due_amount?.currency_code);
  for (const p of inv.payments?.transactions ?? []) {
    console.log('payment         :', JSON.stringify({ type: p.type, method: p.method, date: p.payment_date, amount: p.amount, id: p.payment_id }));
  }
  console.log('last status dates:', JSON.stringify(inv.detail?.metadata ?? {}));
}
