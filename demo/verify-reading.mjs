// Sends every demo receipt through the running server's reading endpoint and compares the
// answer with demo/receipts/expected.json. Needs the server running with GEMINI_API_KEY set.
// Usage: node demo/verify-reading.mjs [serverUrl]
import { readFile } from 'node:fs/promises';

const server = process.argv[2] ?? 'http://localhost:3001';
const expected = JSON.parse((await readFile('demo/receipts/expected.json', 'utf8')).replace(/^﻿/, ''));
const cents = (n) => (n == null ? null : Math.round(n * 100));
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const same = (a, b) => (a ?? 0) === (b ?? 0);

let failures = 0;
for (const exp of expected) {
  const image = await readFile(`demo/receipts/${exp.file}`);
  const t0 = Date.now();
  const res = await fetch(`${server}/api/receipts/read?as=anna`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: image });
  const ms = Date.now() - t0;
  if (!res.ok) {
    failures++;
    console.log(`${exp.file}: HTTP ${res.status} ${JSON.stringify(await res.json().catch(() => ({})))}`);
    continue;
  }
  const r = await res.json();
  const got = r.items.map((i) => i.lineTotalCents).sort((a, b) => a - b).join();
  const want = exp.items.map((i) => cents(i.lineTotal)).sort((a, b) => a - b).join();
  const checks = {
    merchant: norm(r.merchant) === norm(exp.merchant),
    date: r.date === exp.date,
    currency: r.currency === exp.currency,
    items: got === want,
    subtotal: same(r.subtotalCents, cents(exp.subtotal)),
    discount: same(r.discountCents, cents(exp.discount)),
    tax: same(r.taxCents, cents(exp.tax)),
    total: r.totalCents === cents(exp.total),
  };
  const bad = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (bad.length) failures++;
  console.log(`${exp.file.padEnd(20)} ${(ms / 1000).toFixed(1).padStart(5)}s  ${bad.length ? 'WRONG: ' + bad.join(', ') : 'all fields correct'}`);
}
console.log(failures === 0 ? 'ALL OK' : `${failures} receipt(s) differ`);
process.exit(failures === 0 ? 0 : 1);
