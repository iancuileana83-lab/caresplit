import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { sampleReceipts } from './demo-data';
import { createFirestoreStore } from './firestore-store';
import { readerFromEnv } from './gemini';
import { createLimiter, limiterFromEnv } from './limits';
import { paypalFromEnv } from './paypal';
import { createMemoryStore } from './store';

// Built web app: dist/web, next to dist/server.mjs. In development the Vite server serves the web app.
const staticDir = fileURLToPath(new URL('./web', import.meta.url));
const port = Number(process.env.PORT) || 3001;

// DATA_STORE=firestore saves receipts in the "caresplit" database; anything else keeps them in
// memory (lost on restart) and starts with three fictional sample receipts.
const useFirestore = process.env.DATA_STORE === 'firestore';
const store = useFirestore
  ? createFirestoreStore({ projectId: process.env.GCP_PROJECT || 'core-invention-cvz43', databaseId: process.env.FIRESTORE_DATABASE || 'caresplit' })
  : createMemoryStore(sampleReceipts());

const paypal = paypalFromEnv(process.env);

const app = await buildApp({
  store,
  staticDir,
  paypal,
  reader: readerFromEnv(process.env),
  limiter: limiterFromEnv(process.env),
  paypalLimiter: createLimiter({ perIpPerMinute: Number(process.env.PAYPAL_LIMIT_PER_MINUTE) || 12, perDay: Number(process.env.PAYPAL_LIMIT_PER_DAY) || 400 }),
  writeLimiter: createLimiter({ perIpPerMinute: Number(process.env.WRITE_LIMIT_PER_MINUTE) || 20, perDay: Number(process.env.WRITE_LIMIT_PER_DAY) || 300 }),
});
await app.listen({ port, host: '0.0.0.0' });
console.log(`CareSplit server listening on http://localhost:${port}`);
console.log(`Receipts are stored in ${useFirestore ? 'Firestore (database caresplit)' : 'memory (lost when the server stops)'}.`);
if (!process.env.GEMINI_API_KEY) console.log('Note: GEMINI_API_KEY is not set, so receipt reading is off (manual entry still works).');
if (!paypal) console.log('Note: PayPal sandbox keys are not set (or PAYPAL_ENV is not "sandbox"), so sending invoices is off.');
