// PayPal Invoicing API, sandbox only. Secrets stay on the server and are never logged or returned.
import type { ShareStatus } from '../shared/types';

const SANDBOX = 'https://api-m.sandbox.paypal.com';

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    /** PayPal's debug id, safe to log and to quote when asking PayPal for help. */
    public debugId?: string,
  ) {
    super(message);
  }
}

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  /** The sandbox Business account that sends the invoices. */
  merchantEmail: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface InvoiceRequest {
  /** Stable per share (receipt + member): lets PayPal ignore a repeated create. */
  requestId: string;
  recipientName: string;
  recipientEmail: string;
  itemName: string;
  itemDescription: string;
  note: string;
  /** The item's price before any discount. */
  amountCents: number;
  /** A discount on that item (the care credit). The invoice total is amountCents minus this. */
  discountCents?: number;
}

export interface InvoiceInfo {
  id: string;
  status: string;
  number?: string;
  recipientViewUrl?: string;
  /** The invoice total as PayPal calculated it, in cents, when PayPal says it. */
  totalCents?: number;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

/** The five headers PayPal signs a webhook call with. */
export interface WebhookHeaders {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
}

/** The ways a payment made outside PayPal can be recorded. */
export const OUTSIDE_METHODS = ['CASH', 'BANK_TRANSFER', 'OTHER'] as const;
export type OutsideMethod = (typeof OUTSIDE_METHODS)[number];

/** PayPal invoice status -> the three states a share can be in for the family. */
export function mapInvoiceStatus(status: string): ShareStatus {
  switch (status) {
    case 'PAID':
    case 'MARKED_AS_PAID':
      return 'PAID';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'DRAFT':
      return 'DRAFT';
    default:
      // SENT, UNPAID, SCHEDULED, PAYMENT_PENDING, PARTIALLY_PAID, REFUNDED...: still open for the family
      return 'SENT';
  }
}

export function createPayPalClient(config: PayPalConfig) {
  const doFetch = config.fetchFn ?? fetch;
  const timeoutMs = config.timeoutMs ?? 20_000;
  let cached: { token: string; expiresAt: number } | null = null;

  async function token(): Promise<string> {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const res = await doFetch(`${SANDBOX}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new PayPalError('PayPal sign-in failed', res.status);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return cached.token;
  }

  async function call<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    const res = await doFetch(`${SANDBOX}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok) {
      throw new PayPalError(String(json.message ?? `PayPal request failed (${res.status})`), res.status, typeof json.debug_id === 'string' ? json.debug_id : undefined);
    }
    return json as T;
  }

  const toInfo = (inv: Record<string, any>): InvoiceInfo => ({
    id: String(inv.id),
    status: String(inv.status),
    number: inv.detail?.invoice_number,
    recipientViewUrl: inv.detail?.metadata?.recipient_view_url,
    totalCents: inv.amount?.value !== undefined && Number.isFinite(Number(inv.amount.value)) ? Math.round(Number(inv.amount.value) * 100) : undefined,
  });

  return {
    /** Creates a draft invoice (not sent yet). */
    async createDraft(req: InvoiceRequest): Promise<InvoiceInfo> {
      const inv = await call<Record<string, any>>(
        'POST',
        '/v2/invoicing/invoices',
        {
          detail: {
            currency_code: 'USD',
            note: req.note.slice(0, 4000),
            payment_term: { term_type: 'NET_10' },
          },
          invoicer: { name: { business_name: 'CareSplit Demo' }, email_address: config.merchantEmail },
          primary_recipients: [{ billing_info: { name: { given_name: req.recipientName }, email_address: req.recipientEmail } }],
          items: [
            {
              name: req.itemName.slice(0, 200),
              description: req.itemDescription.slice(0, 1000),
              quantity: '1',
              unit_amount: { currency_code: 'USD', value: dollars(req.amountCents) },
              ...(req.discountCents && req.discountCents > 0 ? { discount: { amount: { currency_code: 'USD', value: dollars(req.discountCents) } } } : {}),
            },
          ],
        },
        { 'PayPal-Request-Id': req.requestId },
      );
      // The create call may answer with only a link; read the invoice to get its real fields.
      const id = inv.id ?? String(inv.href ?? '').split('/').pop();
      if (!id) throw new PayPalError('PayPal did not return an invoice id', 502);
      return inv.status ? toInfo({ ...inv, id }) : this.get(String(id));
    },

    async send(invoiceId: string): Promise<void> {
      await call('POST', `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`, { send_to_recipient: true, send_to_invoicer: false });
    },

    /** Withdraws a sent invoice so it can no longer be paid. PayPal also tells the recipient. */
    async cancel(invoiceId: string, note: string): Promise<void> {
      await call('POST', `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/cancel`, {
        subject: 'Invoice cancelled',
        note: note.slice(0, 4000),
        send_to_invoicer: false,
        send_to_recipient: true,
      });
    },

    /** Sends the recipient a reminder email about a sent, unpaid invoice (it stays sent and unpaid). */
    async remind(invoiceId: string, reminder: { subject: string; note: string }): Promise<void> {
      await call('POST', `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/remind`, {
        subject: reminder.subject.slice(0, 200),
        note: reminder.note.slice(0, 4000),
        send_to_invoicer: false,
        send_to_recipient: true,
      });
    },

    /** Records a payment made outside PayPal (cash, bank transfer...). The invoice becomes MARKED_AS_PAID. */
    async recordPayment(invoiceId: string, payment: { method: OutsideMethod; note?: string; amountCents: number; date: string }): Promise<void> {
      await call('POST', `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/payments`, {
        method: payment.method,
        payment_date: payment.date,
        note: payment.note,
        amount: { currency_code: 'USD', value: dollars(payment.amountCents) },
      });
    },

    /**
     * Asks PayPal whether a webhook call really came from PayPal (its signature checks out for our webhook id).
     * The event is embedded exactly as received, byte for byte: re-serialising it could change the text PayPal
     * signed and make a genuine event fail. A PayPal outage throws, so the caller can ask PayPal to retry later.
     */
    async verifyWebhook(input: { webhookId: string; rawBody: string; headers: WebhookHeaders }): Promise<boolean> {
      const h = input.headers;
      const text =
        `{"auth_algo":${JSON.stringify(h.authAlgo)},"cert_url":${JSON.stringify(h.certUrl)},"transmission_id":${JSON.stringify(h.transmissionId)},` +
        `"transmission_sig":${JSON.stringify(h.transmissionSig)},"transmission_time":${JSON.stringify(h.transmissionTime)},` +
        `"webhook_id":${JSON.stringify(input.webhookId)},"webhook_event":${input.rawBody}}`;
      const res = await doFetch(`${SANDBOX}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: text,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const json = (await res.json().catch(() => ({}))) as { verification_status?: string; debug_id?: string };
      if (res.status >= 500) throw new PayPalError('PayPal could not check the signature right now', res.status, json.debug_id);
      return res.ok && json.verification_status === 'SUCCESS';
    },

    async get(invoiceId: string): Promise<InvoiceInfo> {
      return toInfo(await call<Record<string, any>>('GET', `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`));
    },
  };
}

export type PayPalClient = ReturnType<typeof createPayPalClient>;

export function paypalFromEnv(env: NodeJS.ProcessEnv): PayPalClient | undefined {
  if (env.PAYPAL_ENV !== 'sandbox') return undefined; // this app never talks to live PayPal
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return undefined;
  return createPayPalClient({
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    merchantEmail: env.PAYPAL_MERCHANT_EMAIL || 'sb-swgwq53114117@business.example.com',
  });
}
