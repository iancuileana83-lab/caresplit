import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-white px-4 py-3 ${className}`}>{children}</div>;
}

export function Metric({ label, value, tone = 'ink' }: { label: string; value: string; tone?: 'ink' | 'amber' | 'green' }) {
  const color = tone === 'amber' ? 'text-amber-700' : tone === 'green' ? 'text-green-700' : 'text-ink';
  return (
    <Card className="px-3">
      <div className="text-xs text-quiet">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </Card>
  );
}

export function LoadingNote() {
  return (
    <p role="status" className="py-8 text-center text-quiet">
      Loading…
    </p>
  );
}

/** A problem loading something. With `onRetry` it offers a button; without, it asks for a reload. */
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="space-y-3 py-8 text-center">
      <p className="text-red-700">{message.replace(/[.!]?$/, '.')}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="min-h-11 rounded-xl border border-line bg-white px-4 text-sm font-medium hover:bg-stone-50">
          Try again
        </button>
      ) : (
        <p className="text-sm text-quiet">Reload the page to try again.</p>
      )}
    </div>
  );
}
