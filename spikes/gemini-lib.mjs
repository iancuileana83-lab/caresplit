// Shared receipt-reading code for the Gemini spikes. Never prints the API key.
import { readFile } from 'node:fs/promises';

export const DEFAULT_MODEL = 'gemini-3.8-flash';

export const PROMPT = `You read a pharmacy receipt and return amounts and dates only.
Rules:
- Return merchant name, purchase date (ISO YYYY-MM-DD), currency, line items (name, quantity, line total), subtotal, discount, tax and total.
- Items are products only. Line totals are before discounts. Never list discounts, coupons, tax or payment lines as items.
- discount is the sum of all discounts and coupons as a positive number.
- Dates on US receipts are MM/DD/YYYY; use that when the order is ambiguous. Two-digit years are 20xx.
- Ignore patient names, prescription details, doses and any other health information; never copy them.
- Use null for a field that is not on the receipt. Do not guess.
- All money values are plain numbers in the receipt currency.`;

export const SCHEMA = {
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
    discount: { type: 'NUMBER', nullable: true },
    tax: { type: 'NUMBER', nullable: true },
    total: { type: 'NUMBER', nullable: true },
  },
  required: ['items'],
};

export const cents = (n) => Math.round(n * 100);

export async function extractReceipt(imagePath, model = DEFAULT_MODEL) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing in .env');
  const image = (await readFile(imagePath)).toString('base64');
  const t0 = Date.now();
  const body = JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/png', data: image } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
  });
  let res;
  let json;
  // 429/500/503 are temporary ("high demand"): retry with growing waits, like the real app must.
  for (let attempt = 1; attempt <= 5; attempt++) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body,
    });
    json = await res.json();
    if (res.ok || ![429, 500, 503].includes(res.status) || attempt === 5) break;
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json.error ?? json)}`);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  return { data: JSON.parse(text), ms: Date.now() - t0, usage: json.usageMetadata };
}

// The same arithmetic check the real app will run before accepting a reading.
export function arithmeticChecks(d) {
  const sumItems = d.items.reduce((s, i) => s + cents(i.lineTotal), 0);
  const itemsOk = d.subtotal == null ? null : sumItems === cents(d.subtotal);
  const totalOk =
    d.total == null || d.subtotal == null
      ? null
      : cents(d.subtotal) - cents(d.discount ?? 0) + cents(d.tax ?? 0) === cents(d.total);
  return { itemsOk, totalOk };
}
