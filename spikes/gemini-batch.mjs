// Phase 0 spike: run Gemini on every demo receipt and compare with demo/receipts/expected.json.
// Usage: node --env-file=.env spikes/gemini-batch.mjs [model]
import { readFile } from 'node:fs/promises';
import { extractReceipt, arithmeticChecks, cents, DEFAULT_MODEL } from './gemini-lib.mjs';

const model = process.argv[2] ?? DEFAULT_MODEL;
const expected = JSON.parse((await readFile('demo/receipts/expected.json', 'utf8')).replace(/^﻿/, ''));
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const money = (a, b) => (a == null || a === 0 ? b == null || b === 0 : b != null && cents(a) === cents(b));
const ok = (b) => (b ? 'ok' : 'WRONG');

for (const exp of expected) {
  let r;
  try {
    r = await extractReceipt(`demo/receipts/${exp.file}`, model);
  } catch (e) {
    console.log(`${exp.file}: FAILED ${e.message}`);
    continue;
  }
  const d = r.data;
  const gotTotals = d.items.map((i) => cents(i.lineTotal)).sort((a, b) => a - b).join();
  const expTotals = exp.items.map((i) => cents(i.lineTotal)).sort((a, b) => a - b).join();
  const names = exp.items.filter((i) => d.items.some((g) => norm(g.name).includes(norm(i.name).slice(0, 10)))).length;
  const qtyOk = exp.items.every((e) => e.quantity == null || d.items.some((g) => cents(g.lineTotal) === cents(e.lineTotal) && g.quantity === e.quantity));
  const ar = arithmeticChecks(d);
  console.log(
    [
      exp.file.padEnd(20),
      `${(r.ms / 1000).toFixed(1)}s`.padEnd(6),
      `merchant ${ok(norm(d.merchant) === norm(exp.merchant))}`,
      `date ${ok(d.date === exp.date)}`,
      `cur ${ok(d.currency === exp.currency)}`,
      `items ${d.items.length}/${exp.items.length} amounts ${ok(gotTotals === expTotals)} names ${names}/${exp.items.length} qty ${ok(qtyOk)}`,
      `subtotal ${ok(money(exp.subtotal, d.subtotal))}`,
      `discount ${ok(money(exp.discount, d.discount))}`,
      `tax ${ok(money(exp.tax, d.tax))}`,
      `total ${ok(money(exp.total, d.total))}`,
      `app-check ${ar.itemsOk}/${ar.totalOk}`,
    ].join(' | '),
  );
  if (gotTotals !== expTotals || !money(exp.total, d.total) || d.date !== exp.date) {
    console.log('   got:', JSON.stringify({ merchant: d.merchant, date: d.date, items: d.items, subtotal: d.subtotal, discount: d.discount, tax: d.tax, total: d.total }));
  }
}
