import { ArrowLeft, CircleAlert, LoaderCircle, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { formatUsd, splitEqual } from '../../../shared/money';
import type { ReceiptView } from '../../../shared/types';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Steps } from '../components/Steps';
import { ApiError, postJson } from '../lib/api';
import type { ConfirmedReceipt } from '../lib/draft';
import { formatLongDate } from '../lib/receipts';
import { useViewAs } from '../lib/view-as';

interface SendResult {
  receipt: ReceiptView;
  failed: { memberId: string; message: string }[];
}

/** Step 3: shows the equal split, asks for confirmation, saves the receipt and sends the PayPal invoices. */
export function SplitPreview() {
  const { family, viewer } = useViewAs();
  const navigate = useNavigate();
  const receipt = (useLocation().state as { receipt?: ConfirmedReceipt } | null)?.receipt;
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once the receipt is saved, a retry only sends: it never saves a second copy.
  const savedId = useRef<string | null>(null);

  if (!receipt || viewer.role !== 'organiser') return <Navigate to="/add" replace />;

  const parts = splitEqual(receipt.totalCents, family.members.map((m) => m.id), viewer.id);
  const nameOf = (id: string) => family.members.find((m) => m.id === id)?.name ?? id;
  const invoices = parts.filter((p) => p.memberId !== viewer.id);
  const notUsd = receipt.currency !== 'USD';

  async function send(r: ConfirmedReceipt) {
    setConfirming(false);
    setSending(true);
    setError(null);
    try {
      if (!savedId.current) {
        const saved = await postJson<ReceiptView>(`/api/receipts?as=${viewer.id}`, r);
        savedId.current = saved.id;
      }
      const result = await postJson<SendResult>(`/api/receipts/${savedId.current}/send?as=${viewer.id}`);
      navigate(`/receipts/${savedId.current}`, { replace: true, state: { failed: result.failed, justSent: true } });
    } catch (err) {
      setSending(false);
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/add" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-teal-700">
        <ArrowLeft size={18} aria-hidden="true" />
        Back to the photo
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Split & send</h1>
        <p className="mt-0.5 text-quiet">
          {receipt.merchant} · {formatLongDate(receipt.date)}
        </p>
      </div>
      <Steps current={3} />

      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-quiet">Total, paid by {viewer.name}</span>
          <span className="text-xl font-semibold tabular-nums">{formatUsd(receipt.totalCents)}</span>
        </div>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Equal shares</h2>
        <Card className="py-1">
          <ul className="divide-y divide-line">
            {parts.map((p) => (
              <li key={p.memberId} className="flex items-center justify-between py-3">
                <span>
                  <span className="block font-medium">{nameOf(p.memberId)}</span>
                  <span className="block text-xs text-quiet">{p.memberId === viewer.id ? 'Your own share, not invoiced' : 'Will get a PayPal invoice'}</span>
                </span>
                <span className="font-medium tabular-nums">{formatUsd(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <p className="mt-2 text-xs text-quiet">Odd cents stay with the organiser.</p>
      </section>

      {notUsd && (
        <div role="alert" className="flex gap-2 rounded-xl bg-amber-100 px-3 py-2.5 text-sm text-amber-900">
          <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          This receipt is in {receipt.currency}. CareSplit sends invoices in US dollars only, so go back and check the receipt.
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <p className="font-medium">The invoices were not sent</p>
          <p className="mt-0.5">{error}</p>
          {savedId.current && <p className="mt-0.5">Your receipt is saved, so trying again will not create it twice.</p>}
        </div>
      )}

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 text-[15px] font-medium text-white hover:bg-teal-800"
      >
        {sending ? <LoaderCircle size={20} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send size={20} aria-hidden="true" />}
        {sending ? 'Sending invoices…' : error ? 'Try sending again' : 'Send PayPal invoices'}
      </button>

      <ConfirmDialog
        open={confirming && !sending && !notUsd}
        title={`Send ${invoices.length} PayPal invoice${invoices.length === 1 ? '' : 's'}?`}
        confirmLabel="Send invoices"
        onConfirm={() => void send(receipt)}
        onCancel={() => setConfirming(false)}
      >
        <ul className="mb-3 space-y-1 text-ink">
          {invoices.map((p) => (
            <li key={p.memberId} className="flex justify-between">
              <span>{nameOf(p.memberId)}</span>
              <span className="tabular-nums">{formatUsd(p.amountCents)}</span>
            </li>
          ))}
        </ul>
        <p>Invoices go out through PayPal's sandbox, a test mode: no real money moves and the accounts are fictional.</p>
      </ConfirmDialog>
    </div>
  );
}
