import { describe, expect, it } from 'vitest';
import { HANDLED_EVENTS, invoiceIdFromEvent, webhookHeaders } from './webhook';

const ID = 'INV2-YEHS-3RET-ZR5J-EHSX';

describe('invoiceIdFromEvent', () => {
  it('finds the invoice id where PayPal puts it', () => {
    expect(invoiceIdFromEvent({ resource: { invoice: { id: ID, status: 'PAID' } } })).toBe(ID);
    expect(invoiceIdFromEvent({ resource: { id: ID } })).toBe(ID);
    expect(invoiceIdFromEvent({ resource: { invoice_id: ID } })).toBe(ID);
  });

  it('falls back to the id inside a link, but only a well-formed one', () => {
    expect(invoiceIdFromEvent({ resource: { links: [{ href: `https://api.sandbox.paypal.com/v2/invoicing/invoices/${ID}` }] } })).toBe(ID);
    expect(invoiceIdFromEvent({ resource: { invoice: { id: '../../etc/passwd' } } })).toBeUndefined();
    expect(invoiceIdFromEvent({ resource: { invoice: { id: 'INV2-short' } } })).toBeUndefined();
  });

  it('gives nothing for events without an invoice', () => {
    for (const e of [null, undefined, {}, { resource: null }, { resource: 'text' }, { resource: { amount: 5 } }]) expect(invoiceIdFromEvent(e)).toBeUndefined();
  });
});

describe('webhookHeaders', () => {
  const all = {
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
    'paypal-transmission-id': 'abc-123',
    'paypal-transmission-sig': 'c2ln',
    'paypal-transmission-time': '2026-10-04T10:00:00Z',
  };

  it('reads the five signature headers', () => {
    expect(webhookHeaders(all)).toEqual({
      authAlgo: 'SHA256withRSA',
      certUrl: 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
      transmissionId: 'abc-123',
      transmissionSig: 'c2ln',
      transmissionTime: '2026-10-04T10:00:00Z',
    });
  });

  it('refuses a call with a header missing, empty, repeated or absurdly long', () => {
    for (const key of Object.keys(all)) expect(webhookHeaders({ ...all, [key]: undefined }), key).toBeUndefined();
    expect(webhookHeaders({ ...all, 'paypal-transmission-id': '' })).toBeUndefined();
    expect(webhookHeaders({ ...all, 'paypal-transmission-id': ['a', 'b'] })).toBeUndefined();
    expect(webhookHeaders({ ...all, 'paypal-transmission-sig': 'x'.repeat(3000) })).toBeUndefined();
  });
});

describe('HANDLED_EVENTS', () => {
  it('covers paid, cancelled, refunded and updated, and nothing about creating or sending', () => {
    expect([...HANDLED_EVENTS].sort()).toEqual(['INVOICING.INVOICE.CANCELLED', 'INVOICING.INVOICE.PAID', 'INVOICING.INVOICE.REFUNDED', 'INVOICING.INVOICE.UPDATED']);
  });
});
