// Phase 0 spike: PayPal sandbox Invoicing API.
// Usage (from the repo root):
//   node --env-file=.env spikes/paypal-invoice.mjs                       -> token + draft + read back
//   node --env-file=.env spikes/paypal-invoice.mjs --send --to a@b.com   -> also sends the invoice
// Never prints the token, client ID or secret.

const BASE = 'https://api-m.sandbox.paypal.com';
const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV } = process.env;
if (PAYPAL_ENV !== 'sandbox') throw new Error('PAYPAL_ENV must be "sandbox"');
if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error('PayPal keys missing in .env');

const args = process.argv.slice(2);
const send = args.includes('--send');
const to = args[args.indexOf('--to') + 1] ?? 'sibling.demo@example.com';

async function token() {
  const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token failed: ${res.status} ${json.error ?? ''} ${json.error_description ?? ''}`);
  const scopes = String(json.scope).split(' ').map((s) => s.replace('https://uri.paypal.com/services/', '').replace('https://api-m.paypal.com/v1/', '').replace('https://api.paypal.com/v1/', ''));
  console.log('token ok; app id:', json.app_id, '| scopes:', scopes.join(', '));
  return json.access_token;
}

async function api(accessToken, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n${JSON.stringify(json, null, 2)}`);
  return json;
}

const t = await token();

const { invoice_number } = await api(t, 'POST', '/v2/invoicing/generate-next-invoice-number');
console.log('next invoice number:', invoice_number);

const today = new Date().toISOString().slice(0, 10);
const draft = await api(t, 'POST', '/v2/invoicing/invoices', {
  detail: {
    invoice_number,
    invoice_date: today,
    currency_code: 'USD',
    note: 'CareSplit spike: your share of a pharmacy receipt (fictional data).',
    payment_term: { term_type: 'NET_10' },
  },
  invoicer: { name: { business_name: 'CareSplit Demo' } },
  primary_recipients: [
    { billing_info: { name: { given_name: 'Ben', surname: 'Demo' }, email_address: to } },
  ],
  items: [
    {
      name: 'Share of receipt (Green Leaf Pharmacy, 2026-10-02)',
      description: '1/3 of USD 45.60',
      quantity: '1',
      unit_amount: { currency_code: 'USD', value: '15.20' },
    },
  ],
});
// With return=representation the body is the invoice; otherwise it has href only.
const id = draft.id ?? draft.href?.split('/').pop();
console.log('draft created, id:', id);

const read = await api(t, 'GET', `/v2/invoicing/invoices/${id}`);
console.log('status:', read.status, '| total:', read.amount?.value, read.amount?.currency_code);
console.log('invoicer email (from merchant account):', read.invoicer?.email_address ?? '(none)');

if (send) {
  const sent = await api(t, 'POST', `/v2/invoicing/invoices/${id}/send`, {
    send_to_recipient: true,
    send_to_invoicer: false,
  });
  console.log('send response:', JSON.stringify(sent));
  const after = await api(t, 'GET', `/v2/invoicing/invoices/${id}`);
  console.log('status after send:', after.status);
  console.log('recipient view link:', after.detail?.metadata?.recipient_view_url ?? '(none)');
}
