import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { createFirestoreStore } from './firestore-store';
import { readerFromEnv } from './gemini';
import { createLimiter, limiterFromEnv } from './limits';
import { paypalFromEnv } from './paypal';
import { createMemoryStore } from './store';

// Built web app: dist/web, next to dist/server.mjs. In development the Vite server serves the web app.
const staticDir = fileURLToPath(new URL('./web', import.meta.url));
const port = Number(process.env.PORT) || 3001;

// DATA_STORE=firestore saves families and receipts in the "caresplit" database; anything else keeps
// them in memory (lost when the server stops). Either way every visitor starts with a sample family.
const useFirestore = process.env.DATA_STORE === 'firestore';
const store = useFirestore
  ? createFirestoreStore({ projectId: process.env.GCP_PROJECT || 'core-invention-cvz43', databaseId: process.env.FIRESTORE_DATABASE || 'caresplit' })
  : createMemoryStore();

const paypal = paypalFromEnv(process.env);
const num = (name: string, fallback: number) => Number(process.env[name]) || fallback;

const app = await buildApp({
  store,
  staticDir,
  paypal,
  reader: readerFromEnv(process.env),
  limiter: limiterFromEnv(process.env),
  paypalLimiter: createLimiter({ perIpPerMinute: num('PAYPAL_LIMIT_PER_MINUTE', 12), perDay: num('PAYPAL_LIMIT_PER_DAY', 400) }),
  writeLimiter: createLimiter({ perIpPerMinute: num('WRITE_LIMIT_PER_MINUTE', 20), perDay: num('WRITE_LIMIT_PER_DAY', 300) }),
  familyLimiter: createLimiter({ perIpPerMinute: num('FAMILY_LIMIT_PER_MINUTE', 5), perDay: num('FAMILY_LIMIT_PER_DAY', 300) }),
});
await app.listen({ port, host: '0.0.0.0' });
console.log(`CareSplit server listening on http://localhost:${port}`);
console.log(`Data is stored in ${useFirestore ? 'Firestore (database caresplit)' : 'memory (lost when the server stops)'}.`);
if (!process.env.GEMINI_API_KEY) console.log('Note: GEMINI_API_KEY is not set, so receipt reading is off (manual entry still works).');
if (!paypal) console.log('Note: PayPal sandbox keys are not set (or PAYPAL_ENV is not "sandbox"), so sending invoices is off.');
