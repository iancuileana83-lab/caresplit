import { ArrowLeft, CircleAlert, CircleCheck, ExternalLink, LoaderCircle, RefreshCw, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { ReceiptView } from '../../../shared/types';
import { Card, ErrorNote, LoadingNote } from '../components/Card';
import { ShareChip } from '../components/Chip';
import { ApiError, postJson, useApi } from '../lib/api';
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

  useEffect(() => {
    setFresh(null);
    setNotice(null);
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
  const hasUnsent = receipt?.shares.some((s) => s.status === 'DRAFT') ?? false;
  const hasSent = receipt?.shares.some((s) => s.status !== 'DRAFT') ?? false;

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

  return (
    <div className="space-y-4">
      <Link to="/receipts" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-teal-700">
        <ArrowLeft size={18} aria-hidden="true" />
        Receipts
      </Link>

      {!receipt && state.status === 'loading' && <LoadingNote />}
      {!receipt && state.status === 'error' && <ErrorNote message="We couldn't find that receipt" />}
      {receipt && (
        <>
          <section>
            <h1 className="text-2xl font-semibold tracking-tight">{receipt.merchant}</h1>
            <p className="mt-0.5 text-quiet">
              {formatLongDate(receipt.date)} · paid at the pharmacy by {nameOf(receipt.payerId)}
            </p>
          </section>

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
            </Card>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold">{organiser ? 'Who owes what' : 'Your share'}</h2>
            <Card className="py-1">
              <ul className="divide-y divide-line">
                {receipt.shares.map((s) => (
                  <li key={s.memberId} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{nameOf(s.memberId)}</div>
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
        </>
      )}
    </div>
  );
}
