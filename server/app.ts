import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { family, findMember, receiptsFor } from './demo-data';
import { ReadError, type ReceiptReader } from './gemini';
import type { LimitResult } from './limits';
import type { Member } from '../shared/types';

export interface AppOptions {
  /** Folder with the built web app. When it exists, it is served and unknown pages fall back to index.html. */
  staticDir?: string;
  /** Reads a receipt photo. Missing means "not set up" and the endpoint answers 503. */
  reader?: ReceiptReader;
  /** Called once per read request with the visitor's address. */
  limiter?: (ip: string) => LimitResult;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function buildApp({ staticDir, reader, limiter }: AppOptions = {}) {
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

  app.get('/api/family', async () => family);

  app.get('/api/receipts', async (req, reply) => {
    const viewer = viewerFrom(req.query);
    if (!viewer) return reply.code(400).send({ error: 'Unknown family member' });
    return receiptsFor(viewer);
  });

  app.get('/api/receipts/:id', async (req, reply) => {
    const viewer = viewerFrom(req.query);
    if (!viewer) return reply.code(400).send({ error: 'Unknown family member' });
    const { id } = req.params as { id: string };
    const receipt = receiptsFor(viewer).find((r) => r.id === id);
    if (!receipt) return reply.code(404).send({ error: 'Receipt not found' });
    return receipt;
  });

  app.post('/api/receipts/read', async (req, reply) => {
    const viewer = viewerFrom(req.query);
    if (!viewer) return reply.code(400).send({ error: 'Unknown family member' });
    if (viewer.role !== 'organiser') return reply.code(403).send({ error: 'Only the organiser can add receipts' });
    if (!reader) return reply.code(503).send({ error: 'Receipt reading is not set up on this server', code: 'not_configured' });

    const image = req.body;
    if (!Buffer.isBuffer(image) || image.length === 0) return reply.code(400).send({ error: 'Send the receipt photo as the request body' });

    const limit = limiter?.(req.ip) ?? { ok: true as const };
    if (!limit.ok) {
      const message = limit.reason === 'daily' ? 'The demo has reached its daily limit for reading receipts. Try again tomorrow.' : 'Too many receipts in a short time. Wait a minute and try again.';
      return reply.code(429).send({ error: message, code: limit.reason });
    }

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
