import { describe, expect, it } from 'vitest';
import { newFamily } from '../demo-data';
import { PayPalError } from '../paypal';
import { confirmAction, dismissAction, proposeAction, type ActionContext } from './actions';
import { minutes, NOW, setup, share } from './test-helpers';

const propose = (ctx: ActionContext, input: Parameters<typeof proposeAction>[1]) => proposeAction(ctx, input);

describe('confirming an action', () => {
  it('runs a reminder once through PayPal and records it; confirming again changes nothing more', async () => {
    const { ctx, deps, pp, receipts } = await setup();
    const p = await propose(ctx, { kind: 'reminder', receiptId: 'rcpt-1', memberName: 'Ben' });
    if (!p.ok) throw new Error('no proposal');
    const first = await confirmAction(ctx, p.action.id, deps);
    expect(first.http).toBe(200);
    expect(first.action).toMatchObject({ status: 'done', result: 'Reminder sent to Ben through PayPal.' });
    const second = await confirmAction(ctx, p.action.id, deps);
    expect(second.action?.status).toBe('done');
    expect(pp.log.filter((l) => l.startsWith('remind:'))).toHaveLength(1);
    expect(pp.log.find((l) => l.startsWith('remind:'))).toContain('Hi Ben, a friendly reminder about your $3.24 share');
    expect((await receipts.get('rcpt-1'))!.shares[0].reminderSentAt).toBe(NOW.toISOString());
  });

  it('marks a share paid, cancels an invoice, and sends the remaining ones', async () => {
    const { ctx, deps, pp, receipts } = await setup();
    const paid = await propose(ctx, { kind: 'mark_paid', receiptId: 'rcpt-1', memberName: 'Ben', method: 'CASH', note: 'lunch' });
    const cancel = await propose(ctx, { kind: 'cancel', receiptId: 'rcpt-1', memberName: 'Clara' });
    if (!paid.ok || !cancel.ok) throw new Error('no proposal');
    expect((await confirmAction(ctx, paid.action.id, deps)).action?.result).toBe("Ben's share is marked as paid (cash).");
    expect((await confirmAction(ctx, cancel.action.id, deps)).action?.result).toBe("Clara's invoice was cancelled.");
    const saved = (await receipts.get('rcpt-1'))!;
    expect(saved.shares.map((s) => s.status)).toEqual(['PAID', 'CANCELLED']);
    expect(saved.shares[0].paidOutside).toMatchObject({ method: 'CASH', note: 'lunch' });
    expect(pp.log).toContain('record:INV2-FAKE-FAKE-FAKE-0001:CASH:lunch');

    const fresh = await setup([share('ben', 'Ben', 324, 'DRAFT'), share('clara', 'Clara', 325, 'SENT', 'INV2-FAKE-FAKE-FAKE-0002')]);
    const send = await propose(fresh.ctx, { kind: 'send_remaining', receiptId: 'rcpt-1' });
    if (!send.ok) throw new Error('no proposal');
    expect(send.action.title).toBe('Send 1 PayPal invoice');
    const done = await confirmAction(fresh.ctx, send.action.id, fresh.deps);
    expect(done.action).toMatchObject({ status: 'done', result: 'Sent 1 invoice.' });
    expect(fresh.pp.log.filter((l) => l.startsWith('create:'))).toEqual(['create:Ben']); // only the unsent one
  });

  it('checks the real PayPal state first: an invoice paid in the meantime is not cancelled', async () => {
    const { ctx, deps, pp, receipts } = await setup();
    const p = await propose(ctx, { kind: 'cancel', receiptId: 'rcpt-1', memberName: 'Ben' });
    if (!p.ok) throw new Error('no proposal');
    pp.states.set('INV2-FAKE-FAKE-FAKE-0001', 'PAID'); // Ben paid while the card was waiting
    const out = await confirmAction(ctx, p.action.id, deps);
    expect(out.action?.status).toBe('failed');
    expect(out.action?.result).toMatch(/already been paid/);
    expect(pp.log.some((l) => l.startsWith('cancel:'))).toBe(false);
    expect((await receipts.get('rcpt-1'))!.shares[0].status).toBe('PAID'); // the receipt caught up
  });

  it('fails safely when PayPal is down, and says nothing was changed', async () => {
    const { ctx, deps, pp, receipts } = await setup();
    (pp.client as unknown as { remind: () => Promise<void> }).remind = async () => {
      throw new PayPalError('PayPal is down', 503);
    };
    const p = await propose(ctx, { kind: 'reminder', receiptId: 'rcpt-1', memberName: 'Ben' });
    if (!p.ok) throw new Error('no proposal');
    const out = await confirmAction(ctx, p.action.id, deps);
    expect(out.action).toMatchObject({ status: 'failed' });
    expect(out.action?.result).toMatch(/Nothing was changed/);
    expect((await receipts.get('rcpt-1'))!.shares[0].reminderSentAt).toBeUndefined();
  });

  it('expires after five minutes and then does nothing', async () => {
    const { ctx, deps, pp, setNow } = await setup();
    const p = await propose(ctx, { kind: 'reminder', receiptId: 'rcpt-1', memberName: 'Ben' });
    if (!p.ok) throw new Error('no proposal');
    setNow(minutes(6));
    const out = await confirmAction(ctx, p.action.id, deps);
    expect(out.http).toBe(410);
    expect(out.action?.status).toBe('expired');
    expect(pp.log).toEqual([]);
    expect((await confirmAction(ctx, p.action.id, deps)).http).toBe(410);
  });

  it('cannot be confirmed from another family, and not after being dismissed or while running', async () => {
    const { ctx, deps, store, pp } = await setup();
    const p = await propose(ctx, { kind: 'reminder', receiptId: 'rcpt-1', memberName: 'Ben' });
    if (!p.ok) throw new Error('no proposal');
    const other = newFamily('fam-2', NOW);
    await store.saveFamily(other);
    const otherCtx: ActionContext = { ...ctx, family: other, receipts: store.receipts(other.id) };
    expect((await confirmAction(otherCtx, p.action.id, deps)).http).toBe(404);
    expect((await dismissAction(otherCtx, p.action.id)).http).toBe(404);
    expect(pp.log).toEqual([]);

    await dismissAction(ctx, p.action.id);
    expect((await confirmAction(ctx, p.action.id, deps)).http).toBe(409);
    expect(pp.log).toEqual([]);

    const q = await propose(ctx, { kind: 'reminder', receiptId: 'rcpt-1', memberName: 'Clara' });
    if (!q.ok) throw new Error('no proposal');
    await store.saveAction('fam-1', { ...q.action, status: 'running' });
    expect((await confirmAction(ctx, q.action.id, deps)).http).toBe(409);
  });

  it('dismissing keeps a record and is safe to repeat', async () => {
    const { ctx, store } = await setup();
    const p = await propose(ctx, { kind: 'cancel', receiptId: 'rcpt-1', memberName: 'Ben' });
    if (!p.ok) throw new Error('no proposal');
    expect((await dismissAction(ctx, p.action.id)).action?.status).toBe('dismissed');
    expect((await dismissAction(ctx, p.action.id)).action?.status).toBe('dismissed');
    expect((await store.listActions('fam-1', 10))[0]).toMatchObject({ status: 'dismissed', result: 'Dismissed.' });
  });
});
