import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { splitEqual } from '../shared/money';
import type { Member } from '../shared/types';
import { family, findMember, memberEmails } from './demo-data';
import { ReadError, type ReceiptReader } from './gemini';
import { refreshStatuses, sendInvoices, type InvoiceDeps } from './invoices';
import type { LimitResult } from './limits';
import type { PayPalClient } from './paypal';
import type { ReceiptStore, StoredReceipt } from './store';
import { parseNewReceipt } from './validate';
import { organiserView, viewOf, viewsFor } from './views';

export interface AppOptions {
  store: ReceiptStore;
  /** Folder with the built web app. When it exists, it is served and unknown pages fall back to index.html. */
  staticDir?: string;
  /** Reads a receipt photo. Missing means "not set up" and the endpoint answers 503. */
  reader?: ReceiptReader;
  /** PayPal sandbox client. Missing means "not set up" and sending answers 503. */
  paypal?: PayPalClient;
  /** Called once per read request with the visitor's address. */
  limiter?: (ip: string) => LimitResult;
  /** Called once per send or refresh request with the visitor's address. */
  paypalLimiter?: (ip: string) => LimitResult;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const limitMessage = (limit: Extract<LimitResult, { ok: false }>, what: string) =>
  limit.reason === 'daily' ? `The demo has reached its daily limit for ${what}. Try again tomorrow.` : `Too many requests in a short time. Wait a minute and try again.`;

export async function buildApp({ store, staticDir, reader, paypal, limiter, paypalLimiter }: AppOptions) {
  // Behind Cloud Run the real visitor address is in X-Forwarded-For.
  const app = Fastify({ logger: false, trustProxy: true });

  // The receipt photo arrives as the raw request body (image/jpeg, image/png, ...).
  app.addContentTypeParser(/^image\/(jpeg|png|webp|heic|heif)$/, { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES }, (_req, body, done) => done(null, body));

  app.get('/api/health', async () => ({ ok: true }));

  // The demo has no login. `as` is the member picked in the "View as" switcher (phase 1 only;
  // real per-user data isolation arrives in phase 2).
  const viewerFrom = (query: unknown): Member | undefined => {
    const as = (query as { as?: string } | undefined)?.as ?? 'anna';
    return findMember(as);
  };

  const invoiceDeps = (paypalClient: PayPalClient): InvoiceDeps => ({ store, paypal: paypalClient, members: family.members, emailOf: (id) => memberEmails[id] });

  app.get('/api/family', async () => family);

  app.get('/api/receipts', async (req, reply) => {
    const viewer = viewerFrom(req.query);
    if (!viewer) return reply.code(400).send({ error: 'Unknown family member' });
    return viewsFor(await store.list(), viewer);
  });

  app.get('/api/receipts/:id', async (req, reply) => {
    const viewer = viewerFrom(req.query);
    if (!viewer) return reply.code(400).send({ error: 'Unknown family member' });
    const { id } = req.params as { id: string };
    const receipt = await store.get(id);
    const view = receipt && viewOf(receipt, viewer);
    if (!view) return reply.code(404).send({ error: 'Receipt not found' });
    return view;
  });

  // Saves a confirmed receipt with its equal split. Nothing is sent to PayPal yet.
  app.post('/api/receipts', async (req, reply) => {
    const viewer = viewerFrom(req.query);
    if (!viewer) return reply.code(400).send({ error: 'Unknown family member' });
    if (viewer.role !== 'organiser') return reply.code(403).send({ error: 'Only the organiser can add receipts' });
    const parsed = parseNewReceipt(req.body);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });

    const input = parsed.value;
    const parts = splitEqual(input.totalCents, family.members.map((m) => m.id), viewer.id);
    const receipt: StoredReceipt = {
      id: randomUUID(),
      ...input,
      payerId: viewer.id,
      payerShareCents: parts.find((p) => p.memberId === viewer.id)?.amountCents ?? 0,
      shares: parts.filter((p) => p.memberId !== viewer.id).map((p) => ({ memberId: p.memberId, amountCents: p.amountCents, status: 'DRAFT' as const })),
      createdAt: new Date().toISOString(),
    };
    await store.save(receipt);
    return reply.code(201).send(organiserView(receipt));
  });

  // Creates and sends the PayPal invoices that have not been sent yet.
  app.post('/api/receipts/:id/send', async (req, reply) => {
    const viewer = viewerFrom(req.query);
    if (!viewer) return reply.code(400).send({ error: 'Unknown family member' });
    if (viewer.role !== 'organiser') return reply.code(403).send({ error: 'Only the organiser can send invoices' });
    if (!paypal) return reply.code(503).send({ error: 'PayPal is not set up on this server', code: 'not_configured' });
    const limit = paypalLimiter?.(req.ip) ?? { ok: true as const };
    if (!limit.ok) return reply.code(429).send({ error: limitMessage(limit, 'sending invoices'), code: limit.reason });

    const { id } = req.params as { id: string };
    if (!(await store.get(id))) return reply.code(404).send({ error: 'Receipt not found' });
    const { receipt, failed } = await sendInvoices(id, invoiceDeps(paypal));
    return { receipt: organiserView(receipt), failed };
  });

  // Reads each invoice's current status from PayPal.
  app.post('/api/receipts/:id/refresh', async (req, reply) => {
    const viewer = viewerFrom(req.query);
    if (!viewer) return reply.code(400).send({ error: 'Unknown family member' });
    if (viewer.role !== 'organiser') return reply.code(403).send({ error: 'Only the organiser can refresh statuses' });
    if (!paypal) return reply.code(503).send({ error: 'PayPal is not set up on this server', code: 'not_configured' });
    const limit = paypalLimiter?.(req.ip) ?? { ok: true as const };
    if (!limit.ok) return reply.code(429).send({ error: limitMessage(limit, 'checking invoices'), code: limit.reason });

    const { id } = req.params as { id: string };
    if (!(await store.get(id))) return reply.code(404).send({ error: 'Receipt not found' });
    const { receipt, failed } = await refreshStatuses(id, invoiceDeps(paypal));
    return { receipt: organiserView(receipt), failed };
  });

  app.post('/api/receipts/read', async (req, reply) => {
    const viewer = viewerFrom(req.query);
    if (!viewer) return reply.code(400).send({ error: 'Unknown family member' });
    if (viewer.role !== 'organiser') return reply.code(403).send({ error: 'Only the organiser can add receipts' });
    if (!reader) return reply.code(503).send({ error: 'Receipt reading is not set up on this server', code: 'not_configured' });

    const image = req.body;
    if (!Buffer.isBuffer(image) || image.length === 0) return reply.code(400).send({ error: 'Send the receipt photo as the request body' });

    const limit = limiter?.(req.ip) ?? { ok: true as const };
    if (!limit.ok) return reply.code(429).send({ error: limitMessage(limit, 'reading receipts'), code: limit.reason });

    try {
      return await reader({ data: image, mimeType: String(req.headers['content-type']) });
    } catch (err) {
      if (err instanceof ReadError) {
        const status = err.code === 'unreadable' ? 422 : 503;
        const message =
          err.code === 'busy'
            ? 'The AI service is busy right now. Try again in a moment, or enter the receipt by hand.'
            : err.code === 'unreadable'
              ? "We couldn't read that receipt. Try a clearer photo, or enter it by hand."
              : 'Receipt reading is not available right now. You can enter the receipt by hand.';
        return reply.code(status).send({ error: message, code: err.code });
      }
      throw err;
    }
  });

  if (staticDir && existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
