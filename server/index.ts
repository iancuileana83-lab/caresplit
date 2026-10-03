import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { chatModelFromEnv } from './assistant/model';
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
  // Every Gemini request of the assistant is logged by model name only (no text), to see how much quota chat uses.
  chat: chatModelFromEnv(process.env, (model) => console.log(JSON.stringify({ event: 'assistant_gemini_request', model }))),
  chatLimiter: createLimiter({ perIpPerMinute: num('CHAT_LIMIT_PER_MINUTE', 8), perDay: num('CHAT_LIMIT_PER_DAY', 120) }),
  webhookId: process.env.PAYPAL_WEBHOOK_ID || undefined,
  webhookLimiter: createLimiter({ perIpPerMinute: num('WEBHOOK_LIMIT_PER_MINUTE', 120), perDay: num('WEBHOOK_LIMIT_PER_DAY', 5000) }),
});
await app.listen({ port, host: '0.0.0.0' });
console.log(`CareSplit server listening on http://localhost:${port}`);
console.log(`Data is stored in ${useFirestore ? 'Firestore (database caresplit)' : 'memory (lost when the server stops)'}.`);
if (!process.env.GEMINI_API_KEY) console.log('Note: GEMINI_API_KEY is not set, so receipt reading is off (manual entry still works).');
if (!paypal) console.log('Note: PayPal sandbox keys are not set (or PAYPAL_ENV is not "sandbox"), so sending invoices is off.');
if (paypal && !process.env.PAYPAL_WEBHOOK_ID) console.log('Note: PAYPAL_WEBHOOK_ID is not set, so PayPal webhooks (automatic status updates) are off. "Refresh status" still works.');
