import { LoaderCircle, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ApiError, postJson } from '../lib/api';
import { useViewAs } from '../lib/view-as';

export function Family() {
  const { family, viewer } = useViewAs();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setConfirming(false);
    setResetting(true);
    setError(null);
    try {
      await postJson(`/api/demo/reset?as=${viewer.id}`);
      window.location.assign('/'); // a full reload, so every screen starts from the fresh family
    } catch (err) {
      setResetting(false);
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{family.name}</h1>
        <p className="mt-0.5 text-quiet">Pharmacy costs are split in equal shares.</p>
      </div>
      <Card className="py-1">
        <ul className="divide-y divide-line">
          {family.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-teal-50 font-semibold text-teal-700" aria-hidden="true">
                {m.name[0]}
              </span>
              <span className="flex-1">
                <span className="block font-medium">
                  {m.name}
                  {m.id === viewer.id && <span className="ml-2 text-xs font-normal text-quiet">viewing now</span>}
                </span>
                <span className="block text-sm text-quiet">{m.role === 'organiser' ? 'Organiser, usually pays at the pharmacy' : 'Pays their share by PayPal'}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <section aria-label="Demo">
        <h2 className="mb-2 text-sm font-semibold">Your demo</h2>
        <Card>
          <p className="text-sm text-quiet">
            This family is yours alone: other visitors cannot see your receipts, and it is deleted by itself after a week. Start over with fresh
            sample receipts at any time. Invoices already sent in PayPal's sandbox stay there.
          </p>
          {viewer.role === 'organiser' ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-stone-50"
            >
              {resetting ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}
              {resetting ? 'Resetting…' : 'Reset demo'}
            </button>
          ) : (
            <p className="mt-3 text-sm text-quiet">Switch to {family.members.find((m) => m.role === 'organiser')?.name} to reset the demo.</p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </Card>
      </section>

      <ConfirmDialog open={confirming} title="Reset the demo?" confirmLabel="Reset demo" onConfirm={() => void reset()} onCancel={() => setConfirming(false)}>
        <p>Your receipts are removed and the family goes back to the three sample receipts. This cannot be undone.</p>
      </ConfirmDialog>
    </div>
  );
}
