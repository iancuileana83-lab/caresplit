import { describe, expect, it } from 'vitest';
import { createPayPalClient, mapInvoiceStatus, PayPalError } from './paypal';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function client(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as typeof fetch;
  return { calls, paypal: createPayPalClient({ clientId: 'ID', clientSecret: 'SECRET', merchantEmail: 'merchant@example.com', fetchFn }) };
}

const request = {
  requestId: 'req-1',
  recipientName: 'Ben',
  recipientEmail: 'ben@example.com',
  itemName: 'Your share',
  itemDescription: 'desc',
  note: 'note',
  amountCents: 1556,
};

describe('mapInvoiceStatus', () => {
  it('maps PayPal statuses to the family-facing ones', () => {
    expect(mapInvoiceStatus('PAID')).toBe('PAID');
    expect(mapInvoiceStatus('MARKED_AS_PAID')).toBe('PAID');
    expect(mapInvoiceStatus('CANCELLED')).toBe('CANCELLED');
    expect(mapInvoiceStatus('DRAFT')).toBe('DRAFT');
    for (const s of ['SENT', 'UNPAID', 'SCHEDULED', 'PAYMENT_PENDING', 'PARTIALLY_PAID', 'SOMETHING_NEW']) expect(mapInvoiceStatus(s)).toBe('SENT');
  });
});

describe('createPayPalClient', () => {
  it('creates a draft in USD with the right amount, sandbox host and idempotency key', async () => {
    const { calls, paypal } = client((url) => {
      if (url.endsWith('/v1/oauth2/token')) return json({ access_token: 'tok', expires_in: 3600 });
      return json({ id: 'INV2-1', status: 'DRAFT', detail: { invoice_number: '0007' } }, 201);
    });
    const info = await paypal.createDraft(request);
    expect(info).toEqual({ id: 'INV2-1', status: 'DRAFT', number: '0007', recipientViewUrl: undefined });
    const create = calls[1];
    expect(create.url).toBe('https://api-m.sandbox.paypal.com/v2/invoicing/invoices');
    const sent = JSON.parse(String(create.init.body));
    expect(sent.items[0].unit_amount).toEqual({ currency_code: 'USD', value: '15.56' });
    expect(sent.invoicer.email_address).toBe('merchant@example.com');
    expect(sent.primary_recipients[0].billing_info.email_address).toBe('ben@example.com');
    expect((create.init.headers as Record<string, string>)['PayPal-Request-Id']).toBe('req-1');
  });

  it('cancels an invoice and tells the recipient', async () => {
    const { calls, paypal } = client((url) => (url.endsWith('/v1/oauth2/token') ? json({ access_token: 'tok', expires_in: 3600 }) : json({})));
    await paypal.cancel('INV2-1', 'Cancelled by the organiser');
    const cancel = calls[1];
    expect(cancel.url).toBe('https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-1/cancel');
    expect(JSON.parse(String(cancel.init.body))).toEqual({ subject: 'Invoice cancelled', note: 'Cancelled by the organiser', send_to_invoicer: false, send_to_recipient: true });
  });

  it('records a payment made outside PayPal in USD with the date and method', async () => {
    const { calls, paypal } = client((url) => (url.endsWith('/v1/oauth2/token') ? json({ access_token: 'tok', expires_in: 3600 }) : json({ payment_id: 'EXTR-1' })));
    await paypal.recordPayment('INV2-1', { method: 'CASH', note: 'At lunch', amountCents: 1556, date: '2026-10-05' });
    const record = calls[1];
    expect(record.url).toBe('https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-1/payments');
    expect(JSON.parse(String(record.init.body))).toEqual({ method: 'CASH', payment_date: '2026-10-05', note: 'At lunch', amount: { currency_code: 'USD', value: '15.56' } });
  });

  it('reuses the sign-in token between calls', async () => {
    const { calls, paypal } = client((url) => (url.endsWith('/v1/oauth2/token') ? json({ access_token: 'tok', expires_in: 3600 }) : json({ id: 'X', status: 'SENT' })));
    await paypal.get('A');
    await paypal.get('B');
    expect(calls.filter((c) => c.url.endsWith('/v1/oauth2/token'))).toHaveLength(1);
  });

  it('turns PayPal errors into messages without the secret or the token', async () => {
    const { paypal } = client((url) =>
      url.endsWith('/v1/oauth2/token') ? json({ access_token: 'tok', expires_in: 3600 }) : json({ message: 'Invoice is invalid', debug_id: 'abc123' }, 422),
    );
    const error = await paypal.get('X').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PayPalError);
    expect((error as PayPalError).debugId).toBe('abc123');
    expect(String((error as Error).message)).not.toMatch(/SECRET|tok/);
  });

  it('reports a failed sign-in clearly', async () => {
    const { paypal } = client(() => json({ error: 'invalid_client' }, 401));
    await expect(paypal.get('X')).rejects.toMatchObject({ message: 'PayPal sign-in failed', status: 401 });
  });
});
