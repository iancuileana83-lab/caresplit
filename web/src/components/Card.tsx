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
  return <p className="py-8 text-center text-quiet">Loading…</p>;
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p className="py-8 text-center text-red-700" role="alert">
      {message}. Reload the page to try again.
    </p>
  );
}
