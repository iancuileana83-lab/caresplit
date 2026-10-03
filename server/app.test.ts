import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { ReceiptView } from '../shared/types';

async function receiptsAs(as?: string) {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: as ? `/api/receipts?as=${as}` : '/api/receipts' });
  return { status: res.statusCode, body: res.json() };
}

describe('GET /api/receipts', () => {
  it('shows the organiser everything', async () => {
    const { status, body } = await receiptsAs('anna');
    const receipts = body as ReceiptView[];
    expect(status).toBe(200);
    expect(receipts).toHaveLength(3);
    expect(receipts.every((r) => typeof r.totalCents === 'number' && r.shares.length === 2)).toBe(true);
  });

  it('defaults to the organiser', async () => {
    const { body } = await receiptsAs();
    expect((body as ReceiptView[])[0].totalCents).toBeTypeOf('number');
  });

  it('shows a sibling only their own share, with no total and no one else amounts', async () => {
    const { body } = await receiptsAs('ben');
    const receipts = body as ReceiptView[];
    expect(receipts).toHaveLength(3);
    for (const r of receipts) {
      expect(r.totalCents).toBeUndefined();
      expect(r.payerShareCents).toBeUndefined();
      expect(r.shares).toHaveLength(1);
      expect(r.shares[0].memberId).toBe('ben');
    }
    expect(JSON.stringify(receipts)).not.toContain('clara');
  });

  it('rejects an unknown member', async () => {
    const { status } = await receiptsAs('zoe');
    expect(status).toBe(400);
  });
});

describe('GET /api/receipts/:id', () => {
  it('applies the same visibility rules and returns 404 for unknown ids', async () => {
    const app = await buildApp();
    const ok = await app.inject({ method: 'GET', url: '/api/receipts/r-green-leaf?as=clara' });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as ReceiptView).shares.map((s) => s.memberId)).toEqual(['clara']);
    const missing = await app.inject({ method: 'GET', url: '/api/receipts/nope' });
    expect(missing.statusCode).toBe(404);
  });
});
