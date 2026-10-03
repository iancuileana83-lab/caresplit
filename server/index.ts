import { fileURLToPath } from 'node:url';
import { buildApp } from './app';

// Built web app: dist/web, next to dist/server.mjs. In development the Vite server serves the web app.
const staticDir = fileURLToPath(new URL('./web', import.meta.url));
const port = Number(process.env.PORT) || 3001;

const app = await buildApp({ staticDir });
await app.listen({ port, host: '0.0.0.0' });
console.log(`CareSplit server listening on http://localhost:${port}`);
