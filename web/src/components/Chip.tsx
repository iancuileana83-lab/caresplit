import { Check, Clock, Minus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ShareStatus } from '../../../shared/types';

type Tone = 'paid' | 'partial' | 'sent' | 'none' | 'cancelled';

const styles: Record<Tone, string> = {
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  sent: 'bg-amber-100 text-amber-800',
  none: 'bg-stone-200 text-stone-700',
  cancelled: 'bg-stone-200 text-stone-700',
};

const icons: Record<Tone, ReactNode> = {
  paid: <Check size={12} aria-hidden="true" />,
  partial: <Clock size={12} aria-hidden="true" />,
  sent: <Clock size={12} aria-hidden="true" />,
  none: <Minus size={12} aria-hidden="true" />,
  cancelled: <X size={12} aria-hidden="true" />,
};

/** A small status pill. The text always says the state, so colour is never the only signal. */
export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}`}>
      {icons[tone]}
      {children}
    </span>
  );
}

const shareLabels: Record<ShareStatus, { tone: Tone; label: string }> = {
  PAID: { tone: 'paid', label: 'Paid' },
  SENT: { tone: 'sent', label: 'Invoice sent' },
  DRAFT: { tone: 'none', label: 'Not sent' },
  CANCELLED: { tone: 'cancelled', label: 'Cancelled' },
};

export function ShareChip({ status }: { status: ShareStatus }) {
  const { tone, label } = shareLabels[status];
  return <Chip tone={tone}>{label}</Chip>;
}
