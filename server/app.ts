import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { family, findMember, receiptsFor } from './demo-data';
import type { Member } from '../shared/types';

export interface AppOptions {
  /** Folder with the built web app. When it exists, it is served and unknown pages fall back to index.html. */
  staticDir?: string;
}

export async function buildApp({ staticDir }: AppOptions = {}) {
  const app = Fastify({ logger: false });

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

  if (staticDir && existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
