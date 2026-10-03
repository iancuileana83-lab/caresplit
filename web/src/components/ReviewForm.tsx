import { CircleAlert, CircleCheck, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { formatUsd } from '../../../shared/money';
import { analyse, confirmDraft, newItem, type ConfirmedReceipt, type Draft } from '../lib/draft';
import { Card } from './Card';

const inputClass =
  'min-h-11 w-full rounded-xl border bg-white px-3 text-base placeholder:text-stone-400 aria-[invalid=true]:border-red-500 border-line';

function Field({ label, children, className = '' }: { label: string; children: (id: string) => React.ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs text-quiet">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  invalid,
  ariaLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  /** A longer name for screen readers when several fields share the same visible label. */
  ariaLabel?: string;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-quiet" aria-hidden="true">
            $
          </span>
          <input
            id={id}
            aria-label={ariaLabel}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            aria-invalid={invalid}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} pl-7 text-right tabular-nums`}
            placeholder="0.00"
          />
        </div>
      )}
    </Field>
  );
}

interface Props {
  draft: Draft;
  onChange: (d: Draft) => void;
  onConfirm: (r: ConfirmedReceipt) => void;
  imageUrl: string | null;
  /** True when the AI could not read the receipt and the user is typing it in. */
  manual: boolean;
}

export function ReviewForm({ draft, onChange, onConfirm, imageUrl, manual }: Props) {
  const [errors, setErrors] = useState<string[]>([]);
  const analysis = analyse(draft);
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const setItem = (key: string, patch: Partial<Draft['items'][number]>) =>
    set({ items: draft.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) });

  const addsUp = analysis.check.ok && analysis.invalidFields.size === 0;

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const result = confirmDraft(draft);
        setErrors(result.errors);
        if (result.receipt) onConfirm(result.receipt);
      }}
    >
      <p className="text-sm text-quiet">
        {manual ? 'Type in what is on the receipt.' : 'Check what we read. Fix anything that looks wrong.'}
      </p>

      {imageUrl && (
        <details className="rounded-2xl border border-line bg-white px-4 py-2">
          <summary className="min-h-9 cursor-pointer py-1.5 text-sm font-medium text-teal-700">Show the photo</summary>
          <img src={imageUrl} alt="Your receipt" className="mx-auto mb-2 max-h-96 rounded-lg object-contain" />
        </details>
      )}

      {draft.currency !== 'USD' && (
        <div role="note" className="flex gap-2 rounded-xl bg-amber-100 px-3 py-2.5 text-sm text-amber-900">
          <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          This receipt looks like it is in {draft.currency}. CareSplit works in US dollars, so check the amounts.
        </div>
      )}

      <Card className="space-y-3">
        <Field label="Pharmacy">
          {(id) => <input id={id} value={draft.merchant} onChange={(e) => set({ merchant: e.target.value })} className={inputClass} autoComplete="off" />}
        </Field>
        <Field label="Date on the receipt">
          {(id) => <input id={id} type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} className={inputClass} />}
        </Field>
      </Card>

      <section aria-label="Items">
        <h2 className="mb-2 text-sm font-semibold">Items</h2>
        <Card className="space-y-4">
          {draft.items.map((it, index) => (
            <div key={it.key} className="flex items-end gap-2">
              <Field label={`Item ${index + 1}${it.quantity ? ` (× ${it.quantity})` : ''}`} className="min-w-0 flex-1">
                {(id) => <input id={id} value={it.name} onChange={(e) => setItem(it.key, { name: e.target.value })} className={inputClass} autoComplete="off" />}
              </Field>
              <div className="w-28 shrink-0">
                <MoneyField
                  label="Amount"
                  ariaLabel={`Amount for item ${index + 1}`}
                  value={it.amount}
                  onChange={(v) => setItem(it.key, { amount: v })}
                  invalid={analysis.invalidFields.has(it.key)}
                />
              </div>
              <button
                type="button"
                aria-label={`Remove item ${index + 1}`}
                onClick={() => set({ items: draft.items.length > 1 ? draft.items.filter((x) => x.key !== it.key) : [newItem()] })}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-quiet hover:bg-stone-100"
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set({ items: [...draft.items, newItem()] })}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-teal-700"
          >
            <Plus size={16} aria-hidden="true" />
            Add item
          </button>
        </Card>
      </section>

      <section aria-label="Totals">
        <h2 className="mb-2 text-sm font-semibold">Totals</h2>
        <Card className="grid grid-cols-2 gap-3">
          <MoneyField label="Subtotal" value={draft.subtotal} onChange={(v) => set({ subtotal: v })} invalid={analysis.invalidFields.has('subtotal')} />
          <MoneyField label="Discounts" value={draft.discount} onChange={(v) => set({ discount: v })} invalid={analysis.invalidFields.has('discount')} />
          <MoneyField label="Tax" value={draft.tax} onChange={(v) => set({ tax: v })} invalid={analysis.invalidFields.has('tax')} />
          <MoneyField label="Total" value={draft.total} onChange={(v) => set({ total: v })} invalid={analysis.invalidFields.has('total')} />
        </Card>
      </section>

      <div
        role="status"
        className={`rounded-xl px-3 py-2.5 text-sm font-medium ${addsUp ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}
      >
        <div className="flex items-center gap-2">
          {addsUp ? <CircleCheck size={20} aria-hidden="true" /> : <CircleAlert size={20} aria-hidden="true" />}
          {addsUp ? 'Amounts add up' : 'Please check the totals'}
        </div>
        {!addsUp && analysis.check.problems.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-9 font-normal">
            {analysis.check.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>

      {errors.length > 0 && (
        <div role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <p className="font-medium">Before you continue:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <button type="submit" className="min-h-12 w-full rounded-2xl bg-teal-700 px-4 text-[15px] font-medium text-white hover:bg-teal-800">
        {addsUp ? 'Continue' : 'Continue anyway'}
      </button>
      {analysis.amounts.totalCents !== null && <p className="text-center text-xs text-quiet">Total to split: {formatUsd(analysis.amounts.totalCents)}</p>}
    </form>
  );
}
