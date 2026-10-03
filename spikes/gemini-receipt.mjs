// Phase 0 spike: read a pharmacy receipt image with Gemini (structured JSON output).
// Usage: node --env-file=.env spikes/gemini-receipt.mjs [image] [model]
// Never prints the API key.
import { readFile } from 'node:fs/promises';

const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY missing in .env');
const imagePath = process.argv[2] ?? 'spikes/receipts/receipt-01.png';
const model = process.argv[3] ?? 'gemini-2.5-flash';

const prompt = `You read a pharmacy receipt and return amounts and dates only.
Rules:
- Return merchant name, purchase date (ISO YYYY-MM-DD), currency, line items (name, quantity, line total), subtotal, tax and total.
- Dates on US receipts are MM/DD/YYYY; use that when the order is ambiguous.
- Ignore patient names, prescription details, doses and any other health information; never copy them.
- Use null for a field that is not on the receipt. Do not guess.
- All money values are plain numbers in the receipt currency.`;

const schema = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING', nullable: true },
    date: { type: 'STRING', nullable: true, description: 'YYYY-MM-DD' },
    currency: { type: 'STRING', nullable: true, description: 'ISO 4217 code' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'NUMBER', nullable: true },
          lineTotal: { type: 'NUMBER' },
        },
        required: ['name', 'lineTotal'],
      },
    },
    subtotal: { type: 'NUMBER', nullable: true },
    tax: { type: 'NUMBER', nullable: true },
    total: { type: 'NUMBER', nullable: true },
  },
  required: ['items'],
};

const image = (await readFile(imagePath)).toString('base64');
const t0 = Date.now();
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: 'POST',
  headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/png', data: image } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  }),
});
const json = await res.json();
if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json.error ?? json)}`);
const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
const data = JSON.parse(text);
console.log(`model ${model}, ${Date.now() - t0} ms, tokens: ${JSON.stringify(json.usageMetadata)}`);
console.log(JSON.stringify(data, null, 2));

// Sanity checks the real app will also do (amounts must add up).
const cents = (n) => Math.round(n * 100);
const sumItems = data.items.reduce((s, i) => s + cents(i.lineTotal), 0);
console.log('items sum  :', sumItems / 100, '| subtotal:', data.subtotal, '| match:', data.subtotal == null ? 'n/a' : sumItems === cents(data.subtotal));
console.log('sub+tax    :', data.subtotal != null && data.tax != null ? (cents(data.subtotal) + cents(data.tax)) / 100 : 'n/a', '| total:', data.total, '| match:', data.total == null || data.subtotal == null || data.tax == null ? 'n/a' : cents(data.subtotal) + cents(data.tax) === cents(data.total));
