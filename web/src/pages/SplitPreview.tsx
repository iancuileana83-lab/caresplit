import { ArrowLeft, CircleAlert, HeartHandshake, LoaderCircle, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { careCreditRule } from '../../../shared/care';
import { formatUsd } from '../../../shared/money';
import { formatPercent, splitByRule, type SplitRule } from '../../../shared/split';
import type { ReceiptView } from '../../../shared/types';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ruleProblem, SplitRuleEditor } from '../components/SplitRuleEditor';
import { Steps } from '../components/Steps';
import { ApiError, postJson } from '../lib/api';
import type { ConfirmedReceipt } from '../lib/draft';
import { formatLongDate } from '../lib/receipts';
import { useViewAs } from '../lib/view-as';

interface SendResult {
  receipt: ReceiptView;
  failed: { memberId: string; message: string }[];
}

/** Step 3: choose the split, confirm, then save the receipt and send the PayPal invoices. */
export function SplitPreview() {
  const { family, viewer } = useViewAs();
  const navigate = useNavigate();
  const receipt = (useLocation().state as { receipt?: ConfirmedReceipt } | null)?.receipt;
  // Starts from the family's default, and can be changed for this receipt alone.
  const [rule, setRule] = useState<SplitRule>(family.splitRule);
  // The family's care credit is on by default for every receipt, and can be switched off for this one.
  const [applyCare, setApplyCare] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once the receipt is saved, a retry only sends: it never saves a second copy, so the split is then fixed.
  const savedId = useRef<string | null>(null);

  if (!receipt || viewer.role !== 'organiser') return <Navigate to="/add" replace />;

  const memberIds = family.members.map((m) => m.id);
  const members = family.members.map((m) => ({ key: m.id, name: m.name }));
  const problem = ruleProblem(rule, members);
  const credit = family.careCredit && family.careCredit.basisPoints > 0 ? family.careCredit : null;
  const caregiver = credit ? family.members.find((m) => m.id === credit.caregiverId) : undefined;
  // What each person pays: the chosen split, with the care credit on top when it is on.
  const effectiveRule: SplitRule = !problem && credit && caregiver && applyCare ? careCreditRule(rule, memberIds, credit) : rule;
  const baseParts = problem ? null : splitByRule(receipt.totalCents, memberIds, viewer.id, rule);
  const parts = problem ? null : splitByRule(receipt.totalCents, memberIds, viewer.id, effectiveRule);
  const creditCents = credit && baseParts && parts && applyCare ? (baseParts.find((p) => p.memberId === credit.caregiverId)?.amountCents ?? 0) - (parts.find((p) => p.memberId === credit.caregiverId)?.amountCents ?? 0) : 0;
  const nameOf = (id: string) => family.members.find((m) => m.id === id)?.name ?? id;
  const invoices = parts?.filter((p) => p.memberId !== viewer.id && p.amountCents > 0) ?? [];
  const nothingToInvoice = parts !== null && invoices.length === 0;
  const notUsd = receipt.currency !== 'USD';

  async function send(r: ConfirmedReceipt) {
    setConfirming(false);
    setSending(true);
    setError(null);
    try {
      if (!savedId.current) {
        const saved = await postJson<ReceiptView>(`/api/receipts?as=${viewer.id}`, { ...r, splitRule: rule, ...(credit ? { applyCareCredit: applyCare } : {}) });
        savedId.current = saved.id;
      }
      const result = await postJson<SendResult>(`/api/receipts/${savedId.current}/send?as=${viewer.id}`);
      navigate(`/receipts/${savedId.current}`, { replace: true, state: { failed: result.failed, justSent: true } });
    } catch (err) {
      setSending(false);
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  function askToSend() {
    if (problem) return setError(`Fix the split first. ${problem}`);
    if (nothingToInvoice) return setError('With this split nobody else owes anything, so there is nothing to invoice. Choose a different split.');
    setError(null);
    setConfirming(true);
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
        <h2 className="mb-2 text-sm font-semibold">How to split this receipt</h2>
        {savedId.current ? (
          <Card>
            <p className="text-sm text-quiet">Your receipt is saved, so its split can no longer change here.</p>
          </Card>
        ) : (
          <Card>
            <SplitRuleEditor members={members} value={rule} onChange={(r) => { setRule(r); setError(null); }} />
            <p className="mt-3 text-xs text-quiet">The family's usual split is the starting point. Changing it here only affects this receipt.</p>
          </Card>
        )}
      </section>

      {credit && caregiver && (
        <section aria-label="Care credit">
          <Card>
            <label className={`flex min-h-11 items-start gap-3 ${savedId.current ? '' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={applyCare}
                disabled={savedId.current !== null}
                onChange={(e) => {
                  setApplyCare(e.target.checked);
                  setError(null);
                }}
                className="mt-1 size-5 accent-teal-700"
              />
              <span>
                <span className="flex items-center gap-1.5 font-medium">
                  <HeartHandshake size={18} className="text-teal-700" aria-hidden="true" />
                  Apply care credit to this receipt
                </span>
                <span className="block text-sm text-quiet">
                  {caregiver.name} gives time to care, so their share is {formatPercent(credit.basisPoints)}% lower.
                </span>
              </span>
            </label>
            {applyCare && creditCents > 0 && (
              <p role="status" className="mt-2 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">
                Care credit: {caregiver.name} pays {formatUsd(creditCents)} less than their normal share.
              </p>
            )}
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Who pays what</h2>
        <Card className="py-1">
          {parts ? (
            <ul className="divide-y divide-line">
              {parts.map((p) => {
                const own = p.memberId === viewer.id;
                return (
                  <li key={p.memberId} className="flex items-center justify-between py-3">
                    <span>
                      <span className="block font-medium">
                        {nameOf(p.memberId)}
                        {effectiveRule.type === 'percent' && <span className="ml-2 text-xs font-normal text-quiet">{formatPercent(effectiveRule.basisPoints[p.memberId] ?? 0)}%</span>}
                      </span>
                      <span className="block text-xs text-quiet">
                        {own ? 'Your own share, not invoiced' : p.amountCents > 0 ? 'Will get a PayPal invoice' : 'Pays nothing, no invoice'}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">{formatUsd(p.amountCents)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-3 text-sm text-quiet">Fix the percentages above to see the amounts.</p>
          )}
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
          <p className="font-medium">{savedId.current ? 'The invoices were not sent' : 'Not sent yet'}</p>
          <p className="mt-0.5">{error}</p>
          {savedId.current && <p className="mt-0.5">Your receipt is saved, so trying again will not create it twice.</p>}
        </div>
      )}

      <button
        type="button"
        onClick={askToSend}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 text-[15px] font-medium text-white hover:bg-teal-800"
      >
        {sending ? <LoaderCircle size={20} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send size={20} aria-hidden="true" />}
        {sending ? 'Sending invoices…' : savedId.current ? 'Try sending again' : 'Send PayPal invoices'}
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
