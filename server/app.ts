import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { careCreditRule, validateCareCredit } from '../shared/care';
import { splitByRule, validateRule, type SplitRule } from '../shared/split';
import type { FamilyView, Member } from '../shared/types';
import { accountEmail, sandboxAccounts } from './demo-data';
import { parseFamilyUpdate } from './family-validate';
import { getOrCreateFamily, resetFamily, VISITOR_ID } from './families';
import { ReadError, type ReceiptReader } from './gemini';
import { cancelInvoice, markPaidOutside, refreshStatuses, sendInvoices, ShareActionError, syncInvoiceFromWebhook, type InvoiceDeps } from './invoices';
import type { LimitResult } from './limits';
import { PayPalError, type PayPalClient } from './paypal';
import type { ReceiptStore, Store, StoredFamily, StoredReceipt } from './store';
import { parseMarkPaid, parseNewReceipt } from './validate';
import { HANDLED_EVENTS, invoiceIdFromEvent, webhookHeaders } from './webhook';
import { organiserView, viewOf, viewsFor } from './views';

export interface AppOptions {
  store: Store;
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
  /** Called once per "save receipt" request, so nobody can fill the database with junk. */
  writeLimiter?: (ip: string) => LimitResult;
  /** Called when a brand-new visitor family would be created, with the visitor's address. */
  familyLimiter?: (ip: string) => LimitResult;
  /** The id PayPal gave our webhook. Without it the webhook endpoint stays off (503). */
  webhookId?: string;
  /** Called once per webhook call with the caller's address (each call costs a PayPal signature check). */
  webhookLimiter?: (ip: string) => LimitResult;
}

const MAX_WEBHOOK_BYTES = 1024 * 1024;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const limitMessage = (limit: Extract<LimitResult, { ok: false }>, what: string) =>
  limit.reason === 'daily' ? `The demo has reached its daily limit for ${what}. Try again tomorrow.` : `Too many requests in a short time. Wait a minute and try again.`;

const publicFamily = (f: StoredFamily): FamilyView => ({
  name: f.name,
  members: f.members.map((m) => ({ id: m.id, name: m.name, role: m.role, accountId: m.accountId })),
  splitRule: f.splitRule ?? { type: 'equal' },
  careCredit: f.careCredit ?? null,
  accounts: sandboxAccounts.map((a) => ({ id: a.id, label: a.label })), // labels only: the addresses stay on the server
});

export async function buildApp({ store, staticDir, reader, paypal, limiter, paypalLimiter, writeLimiter, familyLimiter, webhookId, webhookLimiter }: AppOptions) {
  // Behind Cloud Run the real visitor address is the last entry of X-Forwarded-For (added by
  // Google's front end). Trust exactly one proxy, so a visitor cannot dodge the rate limits by
  // sending their own X-Forwarded-For header.
  const app = Fastify({ logger: false, trustProxy: (_address, hop) => hop < 1 });

  // The receipt photo arrives as the raw request body (image/jpeg, image/png, ...).
  app.addContentTypeParser(/^image\/(jpeg|png|webp|heic|heif)$/, { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES }, (_req, body, done) => done(null, body));

  app.get('/api/health', async () => ({ ok: true }));

  // PayPal calls this when an invoice changes (paid, cancelled...). It has no visitor id: it is trusted only
  // after PayPal itself confirms the signature, and even then the event only says which invoice to look at;
  // the status is read from PayPal, so a replayed or reordered event cannot set a wrong one.
  app.post(
    '/api/paypal/webhook',
    {
      // Keep the exact text PayPal signed: the signature is checked against it, not against our re-parsed copy.
      preParsing: async (req, _reply, payload) => {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of payload) {
          size += (chunk as Buffer).length;
          if (size > MAX_WEBHOOK_BYTES) throw Object.assign(new Error('Payload too large'), { statusCode: 413 });
          chunks.push(chunk as Buffer);
        }
        const raw = Buffer.concat(chunks);
        (req as FastifyRequest & { rawBody?: string }).rawBody = raw.toString('utf8');
        return Object.assign(Readable.from(raw), { receivedEncodedLength: raw.length });
      },
    },
    async (req, reply) => {
      if (!paypal || !webhookId) return reply.code(503).send({ error: 'PayPal webhooks are not set up on this server', code: 'not_configured' });
      const limit = webhookLimiter?.(req.ip) ?? { ok: true as const };
      if (!limit.ok) return reply.code(429).send({ error: 'Too many calls', code: limit.reason });

      const rawBody = (req as FastifyRequest & { rawBody?: string }).rawBody;
      const headers = webhookHeaders(req.headers);
      const event = req.body as { event_type?: unknown } | null;
      if (!rawBody || !headers || typeof event !== 'object' || event === null) return reply.code(400).send({ error: 'Not a PayPal webhook call' });

      let genuine: boolean;
      try {
        genuine = await paypal.verifyWebhook({ webhookId, rawBody, headers });
      } catch {
        return reply.code(502).send({ error: 'Could not check the signature right now' }); // PayPal will try again later
      }
      if (!genuine) return reply.code(401).send({ error: 'The signature is not valid' });

      if (typeof event.event_type !== 'string' || !HANDLED_EVENTS.has(event.event_type)) return { ok: true, ignored: 'event type not used' };
      const invoiceId = invoiceIdFromEvent(event);
      if (!invoiceId) return { ok: true, ignored: 'no invoice in the event' };
      try {
        return { ok: true, result: await syncInvoiceFromWebhook(invoiceId, store, paypal) };
      } catch {
        return reply.code(502).send({ error: 'Could not read the invoice right now' }); // PayPal will try again later
      }
    },
  );

  interface Context {
    family: StoredFamily;
    receipts: ReceiptStore;
    /** The member picked in the "View as" switcher. */
    viewer: Member;
  }

  // Every other call belongs to one visitor's family, named by the X-Visitor-Id header. A new
  // visitor gets a fresh sample family. `as` is the member picked in the "View as" switcher: the
  // demo has no login, so it is a convenience, not a security boundary.
  async function contextOf(req: FastifyRequest, reply: FastifyReply): Promise<Context | undefined> {
    const visitorId = String(req.headers['x-visitor-id'] ?? '');
    if (!VISITOR_ID.test(visitorId)) {
      void reply.code(400).send({ error: 'Missing or invalid visitor id' });
      return undefined;
    }
    let family = await store.getFamily(visitorId);
    if (!family) {
      const limit = familyLimiter?.(req.ip) ?? { ok: true as const };
      if (!limit.ok) {
        void reply.code(429).send({ error: limitMessage(limit, 'starting new demo families'), code: limit.reason });
        return undefined;
      }
      family = await getOrCreateFamily(store, visitorId);
    }
    const as = (req.query as { as?: string } | undefined)?.as ?? family.members.find((m) => m.role === 'organiser')!.id;
    const viewer = family.members.find((m) => m.id === as);
    if (!viewer) {
      void reply.code(400).send({ error: 'Unknown family member' });
      return undefined;
    }
    return { family, receipts: store.receipts(visitorId), viewer: { id: viewer.id, name: viewer.name, role: viewer.role } };
  }

  const invoiceDeps = (c: Context, paypalClient: PayPalClient): InvoiceDeps => ({
    store: c.receipts,
    paypal: paypalClient,
    members: c.family.members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
    emailOf: (id) => accountEmail(c.family.members.find((m) => m.id === id)?.accountId),
    rememberInvoice: (invoiceId, receiptId, memberId) => store.rememberInvoice(invoiceId, { familyId: c.family.id, receiptId, memberId }, c.family.expireAt),
  });

  app.get('/api/family', async (req, reply) => {
    const c = await contextOf(req, reply);
    return c ? publicFamily(c.family) : undefined;
  });

  // Changes the family: name, 2 to 4 members, who is the organiser, each member's sandbox account and
  // the default split rule. Receipts that already exist keep the shares they were made with.
  app.put('/api/family', async (req, reply) => {
    const c = await contextOf(req, reply);
    if (!c) return;
    if (c.viewer.role !== 'organiser') return reply.code(403).send({ error: 'Only the organiser can change the family' });
    const parsed = parseFamilyUpdate(req.body, c.family);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
    const limit = writeLimiter?.(req.ip) ?? { ok: true as const };
    if (!limit.ok) return reply.code(429).send({ error: limitMessage(limit, 'changing the family'), code: limit.reason });
    const updated: StoredFamily = { ...c.family, ...parsed.value };
    await store.saveFamily(updated);
    return publicFamily(updated);
  });

  // Back to a fresh sample family (organiser only). Invoices already sent in the PayPal sandbox stay there.
  app.post('/api/demo/reset', async (req, reply) => {
    const c = await contextOf(req, reply);
    if (!c) return;
    if (c.viewer.role !== 'organiser') return reply.code(403).send({ error: 'Only the organiser can reset the demo' });
    const limit = writeLimiter?.(req.ip) ?? { ok: true as const };
    if (!limit.ok) return reply.code(429).send({ error: limitMessage(limit, 'resetting the demo'), code: limit.reason });
    return publicFamily(await resetFamily(store, c.family.id));
  });

  app.get('/api/receipts', async (req, reply) => {
    const c = await contextOf(req, reply);
    if (!c) return;
    return viewsFor(await c.receipts.list(), c.viewer);
  });

  app.get('/api/receipts/:id', async (req, reply) => {
    const c = await contextOf(req, reply);
    if (!c) return;
    const { id } = req.params as { id: string };
    const receipt = await c.receipts.get(id);
    const view = receipt && viewOf(receipt, c.viewer);
    if (!view) return reply.code(404).send({ error: 'Receipt not found' });
    return view;
  });

  // Saves a confirmed receipt with its equal split. Nothing is sent to PayPal yet.
  app.post('/api/receipts', async (req, reply) => {
    const c = await contextOf(req, reply);
    if (!c) return;
    if (c.viewer.role !== 'organiser') return reply.code(403).send({ error: 'Only the organiser can add receipts' });
    const parsed = parseNewReceipt(req.body);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
    const limit = writeLimiter?.(req.ip) ?? { ok: true as const };
    if (!limit.ok) return reply.code(429).send({ error: limitMessage(limit, 'saving receipts'), code: limit.reason });

    // The split for this receipt: the one sent with it, or else the family's default.
    const memberIds = c.family.members.map((m) => m.id);
    const body = req.body as { splitRule?: unknown; applyCareCredit?: unknown };
    const baseRule: SplitRule = body.splitRule === undefined ? (c.family.splitRule ?? { type: 'equal' }) : (body.splitRule as SplitRule);
    const ruleProblem = validateRule(baseRule, memberIds);
    if (ruleProblem) return reply.code(400).send({ error: ruleProblem });
    if (body.applyCareCredit !== undefined && typeof body.applyCareCredit !== 'boolean') return reply.code(400).send({ error: 'applyCareCredit must be true or false' });

    const input = parsed.value;
    const nameOf = (id: string) => c.family.members.find((m) => m.id === id)?.name;

    // The family's care credit is applied on top, unless the organiser switched it off for this receipt.
    let rule = baseRule;
    let careCredit: StoredReceipt['careCredit'];
    const credit = c.family.careCredit;
    if (credit && credit.basisPoints > 0 && body.applyCareCredit !== false && validateCareCredit(credit, memberIds) === null) {
      rule = careCreditRule(baseRule, memberIds, credit);
      const before = splitByRule(input.totalCents, memberIds, c.viewer.id, baseRule).find((p) => p.memberId === credit.caregiverId)!.amountCents;
      const after = splitByRule(input.totalCents, memberIds, c.viewer.id, rule).find((p) => p.memberId === credit.caregiverId)!.amountCents;
      if (before - after > 0) {
        careCredit = { caregiverId: credit.caregiverId, caregiverName: nameOf(credit.caregiverId) ?? 'the caregiver', basisPoints: credit.basisPoints, creditCents: before - after, baseSplitRule: baseRule };
      } else {
        rule = baseRule; // no cent changes hands, so keep the receipt plain
      }
    }
    const parts = splitByRule(input.totalCents, memberIds, c.viewer.id, rule);
    // A member who owes nothing gets no share and no invoice.
    const shares = parts.filter((p) => p.memberId !== c.viewer.id && p.amountCents > 0).map((p) => ({ memberId: p.memberId, memberName: nameOf(p.memberId), amountCents: p.amountCents, status: 'DRAFT' as const }));
    if (shares.length === 0) return reply.code(400).send({ error: 'With this split nobody else owes anything, so there is nothing to invoice. Choose a different split.' });
    const receipt: StoredReceipt = {
      id: randomUUID(),
      ...input,
      payerId: c.viewer.id,
      payerShareCents: parts.find((p) => p.memberId === c.viewer.id)?.amountCents ?? 0,
      shares,
      splitRule: rule,
      ...(careCredit ? { careCredit } : {}),
      createdAt: new Date().toISOString(),
      expireAt: c.family.expireAt,
    };
    await c.receipts.save(receipt);
    return reply.code(201).send(organiserView(receipt));
  });

  // Creates and sends the PayPal invoices that have not been sent yet.
  app.post('/api/receipts/:id/send', async (req, reply) => {
    const c = await contextOf(req, reply);
    if (!c) return;
    if (c.viewer.role !== 'organiser') return reply.code(403).send({ error: 'Only the organiser can send invoices' });
    if (!paypal) return reply.code(503).send({ error: 'PayPal is not set up on this server', code: 'not_configured' });
    const limit = paypalLimiter?.(req.ip) ?? { ok: true as const };
    if (!limit.ok) return reply.code(429).send({ error: limitMessage(limit, 'sending invoices'), code: limit.reason });

    const { id } = req.params as { id: string };
    const existing = await c.receipts.get(id);
    if (!existing) return reply.code(404).send({ error: 'Receipt not found' });
    if (existing.sample) return reply.code(400).send({ error: 'Sample receipts have no invoices to send' });
    const { receipt, failed } = await sendInvoices(id, invoiceDeps(c, paypal));
    return { receipt: organiserView(receipt), failed };
  });

  // Shared by "cancel" and "mark as paid": one sibling's share of one real receipt, organiser only.
  async function shareAction(
    req: FastifyRequest,
    reply: FastifyReply,
    run: (c: Context, receiptId: string, memberId: string, paypalClient: PayPalClient) => Promise<StoredReceipt>,
  ) {
    const c = await contextOf(req, reply);
    if (!c) return;
    if (c.viewer.role !== 'organiser') return reply.code(403).send({ error: 'Only the organiser can do this' });
    if (!paypal) return reply.code(503).send({ error: 'PayPal is not set up on this server', code: 'not_configured' });
    const { id, memberId } = req.params as { id: string; memberId: string };
    const existing = await c.receipts.get(id);
    if (!existing) return reply.code(404).send({ error: 'Receipt not found' });
    if (existing.sample) return reply.code(400).send({ error: 'Sample receipts have no invoices' });
    const limit = paypalLimiter?.(req.ip) ?? { ok: true as const };
    if (!limit.ok) return reply.code(429).send({ error: limitMessage(limit, 'changing invoices'), code: limit.reason });
    try {
      return { receipt: organiserView(await run(c, id, memberId, paypal)) };
    } catch (err) {
      if (err instanceof ShareActionError) return reply.code(err.status).send({ error: err.message });
      if (err instanceof PayPalError) {
        return reply.code(502).send({ error: `PayPal could not do that right now (${err.message}). Nothing was changed. Try again in a moment.`, code: 'paypal_error' });
      }
      throw err;
    }
  }

  // Withdraws a sibling's sent, unpaid invoice.
  app.post('/api/receipts/:id/shares/:memberId/cancel', (req, reply) => shareAction(req, reply, (c, id, memberId, p) => cancelInvoice(id, memberId, invoiceDeps(c, p))));

  // Records that a sibling paid their share outside PayPal.
  app.post('/api/receipts/:id/shares/:memberId/mark-paid', (req, reply) => {
    const parsed = parseMarkPaid(req.body);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
    return shareAction(req, reply, (c, id, memberId, p) => markPaidOutside(id, memberId, parsed.value, invoiceDeps(c, p)));
  });

  // Reads each invoice's current status from PayPal.
  app.post('/api/receipts/:id/refresh', async (req, reply) => {
    const c = await contextOf(req, reply);
    if (!c) return;
    if (c.viewer.role !== 'organiser') return reply.code(403).send({ error: 'Only the organiser can refresh statuses' });
    if (!paypal) return reply.code(503).send({ error: 'PayPal is not set up on this server', code: 'not_configured' });
    const limit = paypalLimiter?.(req.ip) ?? { ok: true as const };
    if (!limit.ok) return reply.code(429).send({ error: limitMessage(limit, 'checking invoices'), code: limit.reason });

    const { id } = req.params as { id: string };
    const existing = await c.receipts.get(id);
    if (!existing) return reply.code(404).send({ error: 'Receipt not found' });
    if (existing.sample) return reply.code(400).send({ error: 'Sample receipts have no invoices to check' });
    const { receipt, failed } = await refreshStatuses(id, invoiceDeps(c, paypal));
    return { receipt: organiserView(receipt), failed };
  });

  app.post('/api/receipts/read', async (req, reply) => {
    const c = await contextOf(req, reply);
    if (!c) return;
    if (c.viewer.role !== 'organiser') return reply.code(403).send({ error: 'Only the organiser can add receipts' });
    if (!reader) return reply.code(503).send({ error: 'Receipt reading is not set up on this server', code: 'not_configured' });

    const image = req.body;
    if (!Buffer.isBuffer(image) || image.length === 0) return reply.code(400).send({ error: 'Send the receipt photo as the request body' });

    const limit = limiter?.(req.ip) ?? { ok: true as const };
    if (!limit.ok) return reply.code(429).send({ error: limitMessage(limit, 'reading receipts'), code: limit.reason });

    // The photo lives only in this request's memory and is sent to Gemini. It is never written to
    // disk, to Firestore or to a log: only the numbers and text that were read are kept.
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
