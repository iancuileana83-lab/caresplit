// Phase 0 spike: read one pharmacy receipt image with Gemini (structured JSON output).
// Usage: node --env-file=.env spikes/gemini-receipt.mjs [image] [model]
import { extractReceipt, arithmeticChecks, DEFAULT_MODEL } from './gemini-lib.mjs';

const imagePath = process.argv[2] ?? 'spikes/receipts/receipt-01.png';
const model = process.argv[3] ?? DEFAULT_MODEL;
const { data, ms, usage } = await extractReceipt(imagePath, model);
console.log(`model ${model}, ${ms} ms, tokens: ${JSON.stringify(usage)}`);
console.log(JSON.stringify(data, null, 2));
console.log('arithmetic:', JSON.stringify(arithmeticChecks(data)));
