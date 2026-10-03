// Helpers for PayPal webhook calls: which events we act on, how to find the invoice in one,
// and how to read the five signature headers.
import type { WebhookHeaders } from './paypal';

/** The invoice events that can change a share's status. Anything else is acknowledged and ignored. */
export const HANDLED_EVENTS = new Set([
  'INVOICING.INVOICE.PAID',
  'INVOICING.INVOICE.CANCELLED',
  'INVOICING.INVOICE.REFUNDED',
  'INVOICING.INVOICE.UPDATED',
]);

const INVOICE_ID = /^INV2-[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/;
const INVOICE_ID_IN_TEXT = /INV2-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}/;

/**
 * The PayPal invoice id an event is about, or undefined. PayPal puts it in `resource.invoice.id`; a few
 * event shapes use `resource.id`, so those are tried too, and as a last resort the id is picked out of the
 * resource's text. Only a well-formed invoice id is ever returned.
 */
export function invoiceIdFromEvent(event: unknown): string | undefined {
  const resource = (event as { resource?: Record<string, unknown> } | null)?.resource;
  if (!resource || typeof resource !== 'object') return undefined;
  const candidates = [(resource.invoice as { id?: unknown } | undefined)?.id, resource.id, resource.invoice_id];
  for (const c of candidates) if (typeof c === 'string' && INVOICE_ID.test(c)) return c;
  return INVOICE_ID_IN_TEXT.exec(JSON.stringify(resource))?.[0];
}

/** The signature headers of a webhook call, or undefined when one is missing. */
export function webhookHeaders(headers: Record<string, unknown>): WebhookHeaders | undefined {
  const get = (name: string) => (typeof headers[name] === 'string' ? (headers[name] as string) : '');
  const parsed = {
    authAlgo: get('paypal-auth-algo'),
    certUrl: get('paypal-cert-url'),
    transmissionId: get('paypal-transmission-id'),
    transmissionSig: get('paypal-transmission-sig'),
    transmissionTime: get('paypal-transmission-time'),
  };
  return Object.values(parsed).every((v) => v.length > 0 && v.length < 2000) ? parsed : undefined;
}
