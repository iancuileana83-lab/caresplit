import { ArrowLeft, Ban, Banknote, CircleAlert, CircleCheck, ExternalLink, LoaderCircle, RefreshCw, SearchX, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { formatPercent } from '../../../shared/split';
import type { ReceiptView, Share } from '../../../shared/types';
import { Card, ErrorNote, LoadingNote } from '../components/Card';
import { ShareChip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ApiError, getJson, postJson, useApi } from '../lib/api';
import { formatLongDate, formatUsd } from '../lib/receipts';
import { useViewAs } from '../lib/view-as';

interface Failure {
  memberId: string;
  message: string;
}
interface ActionResult {
  receipt: ReceiptView;
  failed: Failure[];
}
type Notice = { tone: 'ok' | 'problem'; text: string; details?: string[] } | null;

type Method = 'CASH' | 'BANK_TRANSFER' | 'OTHER';
const METHOD_LABELS: Record<Method, string> = { CASH: 'cash', BANK_TRANSFER: 'bank transfer', OTHER: 'another way' };

/** What the organiser is being asked to confirm for one person's share. */
type ShareDialog = { kind: 'cancel' | 'paid'; share: Share } | null;

export function ReceiptDetail() {
  const { id = '' } = useParams();
  const { family, viewer } = useViewAs();
  const arrival = (useLocation().state as { justSent?: boolean; failed?: Failure[] } | null) ?? null;
  const state = useApi<ReceiptView>(`/api/receipts/${encodeURIComponent(id)}?as=${viewer.id}`);
  const nameOf = (memberId: string) => family.members.find((m) => m.id === memberId)?.name ?? memberId;

  // After an action the server returns the fresh receipt; show it without reloading the page.
  const [fresh, setFresh] = useState<ReceiptView | null>(null);
  const [busy, setBusy] = useState<'send' | 'refresh' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  // Cancel an invoice, or record a payment made outside PayPal, for one person.
  const [dialog, setDialog] = useState<ShareDialog>(null);
  const [method, setMethod] = useState<Method>('CASH');
  const [note, setNote] = useState('');
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    setFresh(null);
    setNotice(null);
    setDialog(null);
  }, [id, viewer.id]);

  useEffect(() => {
    if (!arrival?.justSent || viewer.role !== 'organiser') return;
    const failed = arrival.failed ?? [];
    setNotice(
      failed.length === 0
        ? { tone: 'ok', text: 'Invoices sent through PayPal (sandbox).' }
        : { tone: 'problem', text: "Some invoices couldn't be sent.", details: failed.map((f) => `${nameOf(f.memberId)}: ${f.message}`) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival?.justSent]);

  const receipt = fresh ?? (state.status === 'ready' ? state.data : null);
  const organiser = viewer.role === 'organiser';
  const real = receipt !== null && !receipt.sample; // samples have no PayPal invoices to send or refresh
  const hasUnsent = real && receipt.shares.some((s) => s.status === 'DRAFT');
  const hasSent = real && receipt.shares.some((s) => s.status !== 'DRAFT');

  async function act(kind: 'send' | 'refresh') {
    setBusy(kind);
    setNotice(null);
    try {
      const result = await postJson<ActionResult>(`/api/receipts/${encodeURIComponent(id)}/${kind}?as=${viewer.id}`);
      setFresh(result.receipt);
      if (result.failed.length > 0) {
        setNotice({
          tone: 'problem',
          text: kind === 'send' ? "Some invoices couldn't be sent." : "Some statuses couldn't be checked.",
          details: result.failed.map((f) => `${nameOf(f.memberId)}: ${f.message}`),
        });
      } else {
        setNotice({ tone: 'ok', text: kind === 'send' ? 'Invoices sent through PayPal (sandbox).' : 'Statuses are up to date.' });
      }
    } catch (err) {
      setNotice({ tone: 'problem', text: err instanceof ApiError ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  }

  async function runShareAction(current: NonNullable<ShareDialog>) {
    setShareBusy(true);
    setNotice(null);
    const who = current.share.name ?? nameOf(current.share.memberId);
    const path = current.kind === 'cancel' ? 'cancel' : 'mark-paid';
    try {
      const result = await postJson<{ receipt: ReceiptView }>(
        `/api/receipts/${encodeURIComponent(id)}/shares/${encodeURIComponent(current.share.memberId)}/${path}?as=${viewer.id}`,
        current.kind === 'paid' ? { method, note: note.trim() || undefined } : undefined,
      );
      setFresh(result.receipt);
      setNotice({ tone: 'ok', text: current.kind === 'cancel' ? `${who}'s invoice was cancelled.` : `${who}'s share is marked as paid (${METHOD_LABELS[method]}).` });
      setDialog(null);
      setNote('');
    } catch (err) {
      setDialog(null);
      setNotice({ tone: 'problem', text: err instanceof ApiError ? err.message : 'Something went wrong.' });
      // The server may have found the invoice already paid or cancelled and updated it: show that.
      if (err instanceof ApiError && err.status === 409) {
        try {
          const latest = await getJson<ReceiptView>(`/api/receipts/${encodeURIComponent(id)}?as=${viewer.id}`);
          setFresh(latest);
        } catch {
          /* the message above is enough */
        }
      }
    } finally {
      setShareBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/receipts" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-teal-700">
        <ArrowLeft size={18} aria-hidden="true" />
        Receipts
      </Link>

      {!receipt && state.status === 'loading' && <LoadingNote />}
      {!receipt &&
        state.status === 'error' &&
        (state.code === 404 ? (
          <Card>
            <EmptyState icon={SearchX} title="We couldn't find that receipt" action={{ to: '/receipts', label: 'See all receipts' }}>
              It may be for someone else, or it was removed when the demo was reset.
            </EmptyState>
          </Card>
        ) : (
          <ErrorNote message={state.message} onRetry={state.retry} />
        ))}
      {receipt && (
        <>
          <section>
            <h1 className="text-2xl font-semibold tracking-tight">{receipt.merchant}</h1>
            <p className="mt-0.5 text-quiet">
              {formatLongDate(receipt.date)} · paid at the pharmacy by {nameOf(receipt.payerId)}
            </p>
          </section>

          {receipt.sample && (
            <div role="note" className="rounded-xl bg-stone-200 px-3 py-2.5 text-sm text-stone-800">
              This is a sample receipt that came with the demo family. No PayPal invoices exist for it.
            </div>
          )}

          {notice && (
            <div role="status" className={`rounded-xl px-3 py-2.5 text-sm ${notice.tone === 'ok' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
              <div className="flex items-center gap-2 font-medium">
                {notice.tone === 'ok' ? <CircleCheck size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
                {notice.text}
              </div>
              {notice.details && (
                <ul className="mt-1 list-disc pl-7 font-normal">
                  {notice.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {receipt.totalCents !== undefined && (
            <Card>
              <div className="flex items-baseline justify-between">
                <span className="text-quiet">Total</span>
                <span className="text-xl font-semibold tabular-nums">{formatUsd(receipt.totalCents)}</span>
              </div>
              {receipt.careCredit && (
                <p className="mt-1 text-sm text-teal-800">
                  Care credit: {receipt.careCredit.caregiverName} pays {formatUsd(receipt.careCredit.creditCents)} less than their normal share ({formatPercent(receipt.careCredit.basisPoints)}% credit).
                </p>
              )}
              {receipt.splitRule && (
                <p className="mt-1 text-sm text-quiet">
                  {receipt.splitRule.type === 'equal'
                    ? 'Split in equal shares'
                    : `Split by percentage: ${Object.entries(receipt.splitRule.basisPoints)
                        .filter(([, bp]) => bp > 0)
                        .map(([id, bp]) => `${receipt.shares.find((s) => s.memberId === id)?.name ?? nameOf(id)} ${formatPercent(bp)}%`)
                        .join(', ')}`}
                </p>
              )}
            </Card>
          )}

          {!organiser && receipt.careCredit && receipt.careCredit.caregiverId === viewer.id && (
            <div role="note" className="rounded-xl bg-teal-50 px-3 py-2.5 text-sm text-teal-900">
              <p className="font-medium">Thank you for the time you give.</p>
              <p>Your share is {formatUsd(receipt.careCredit.creditCents)} lower on this receipt because of your care credit.</p>
            </div>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold">{organiser ? 'Who owes what' : 'Your share'}</h2>
            <Card className="py-1">
              <ul className="divide-y divide-line">
                {receipt.shares.map((s) => (
                  <li key={s.memberId} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{s.name ?? nameOf(s.memberId)}</div>
                        <div className="text-sm tabular-nums text-quiet">{formatUsd(s.amountCents)}</div>
                      </div>
                      <ShareChip status={s.status} />
                    </div>
                    {s.status !== 'DRAFT' && s.invoiceUrl && (
                      <a
                        href={s.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-teal-700 underline-offset-2 hover:underline"
                      >
                        {viewer.id === s.memberId ? (s.status === 'PAID' ? 'View your invoice' : 'Open your invoice') : 'View invoice'}
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    )}
                    {s.paidOutside && (
                      <p className="mt-1 text-sm text-quiet">
                        Paid outside PayPal ({METHOD_LABELS[s.paidOutside.method]})
                        {s.paidOutside.note ? `: ${s.paidOutside.note}` : ''}
                      </p>
                    )}
                    {organiser && real && s.status === 'SENT' && (
                      <div className="mt-1 flex flex-wrap gap-x-4">
                        <button
                          type="button"
                          onClick={() => {
                            setMethod('CASH');
                            setNote('');
                            setDialog({ kind: 'paid', share: s });
                          }}
                          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-teal-700"
                        >
                          <Banknote size={16} aria-hidden="true" />
                          Mark as paid
                        </button>
                        <button type="button" onClick={() => setDialog({ kind: 'cancel', share: s })} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-red-700">
                          <Ban size={16} aria-hidden="true" />
                          Cancel invoice
                        </button>
                      </div>
                    )}
                  </li>
                ))}
                {receipt.payerShareCents !== undefined && (
                  <li className="flex items-center justify-between py-3 text-quiet">
                    <span>
                      {nameOf(receipt.payerId)}'s own share
                      <span className="block text-xs">Not invoiced</span>
                    </span>
                    <span className="tabular-nums">{formatUsd(receipt.payerShareCents)}</span>
                  </li>
                )}
              </ul>
            </Card>
          </section>

          {organiser && (hasUnsent || hasSent) && (
            <div className="flex flex-col gap-2">
              {hasUnsent && (
                <button
                  type="button"
                  onClick={() => void act('send')}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 text-[15px] font-medium text-white hover:bg-teal-800"
                >
                  {busy === 'send' ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
                  {busy === 'send' ? 'Sending…' : 'Send remaining invoices'}
                </button>
              )}
              {hasSent && (
                <button
                  type="button"
                  onClick={() => void act('refresh')}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-4 text-[15px] font-medium hover:bg-stone-50"
                >
                  {busy === 'refresh' ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw size={18} aria-hidden="true" />}
                  {busy === 'refresh' ? 'Checking PayPal…' : 'Refresh status'}
                </button>
              )}
            </div>
          )}

          <ConfirmDialog
            open={dialog?.kind === 'cancel' && !shareBusy}
            title={`Cancel ${dialog?.share.name ?? ''}'s invoice?`.replace("  ", ' ')}
            confirmLabel="Cancel the invoice"
            cancelLabel="Keep it"
            onConfirm={() => dialog && void runShareAction(dialog)}
            onCancel={() => setDialog(null)}
          >
            <p>
              The {dialog ? formatUsd(dialog.share.amountCents) : ''} invoice is withdrawn in PayPal, so {dialog?.share.name ?? 'this person'} can no longer pay it, and it stops
              counting as owed. This can't be undone.
            </p>
          </ConfirmDialog>

          <ConfirmDialog
            open={dialog?.kind === 'paid' && !shareBusy}
            title={`Mark ${dialog?.share.name ?? ''}'s share as paid?`.replace("  ", ' ')}
            confirmLabel="Mark as paid"
            onConfirm={() => dialog && void runShareAction(dialog)}
            onCancel={() => setDialog(null)}
          >
            <p className="mb-3">
              Use this when {dialog?.share.name ?? 'this person'} paid you {dialog ? formatUsd(dialog.share.amountCents) : ''} some other way. PayPal records it on the invoice as paid.
            </p>
            <label htmlFor="paid-method" className="mb-1 block text-xs text-quiet">
              How was it paid?
            </label>
            <select id="paid-method" value={method} onChange={(e) => setMethod(e.target.value as Method)} className="mb-3 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base text-ink">
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="OTHER">Another way</option>
            </select>
            <label htmlFor="paid-note" className="mb-1 block text-xs text-quiet">
              Note (optional)
            </label>
            <input
              id="paid-note"
              value={note}
              maxLength={100}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: paid at lunch"
              autoComplete="off"
              className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base text-ink"
            />
          </ConfirmDialog>

          {shareBusy && (
            <p role="status" className="text-center text-sm text-quiet">
              Working with PayPal…
            </p>
          )}
        </>
      )}
    </div>
  );
}
