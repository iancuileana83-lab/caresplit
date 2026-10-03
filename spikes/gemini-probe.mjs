// Probes which Gemini models answer right now (one request each, no retries). Prints status only.
// Usage: node --env-file=.env spikes/gemini-probe.mjs model1 model2 ...
import { readFile } from 'node:fs/promises';

const key = process.env.GEMINI_API_KEY;
const image = (await readFile('demo/receipts/01-simple.png')).toString('base64');
const models = process.argv.slice(2);
const body = JSON.stringify({
  contents: [{ parts: [{ text: 'Return the merchant name on this receipt as JSON {"merchant": string}.' }, { inline_data: { mime_type: 'image/png', data: image } }] }],
  generationConfig: { responseMimeType: 'application/json' },
});
for (const model of models) {
  const results = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body,
    });
    results.push(`${res.status} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  console.log(model.padEnd(28), results.join('  '));
}
