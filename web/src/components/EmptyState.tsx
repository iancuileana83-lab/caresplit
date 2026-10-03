import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** An invitation, not an apology: what this place is for, and the one thing to do next. */
export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: { to: string; label: string } }) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
        <Icon size={24} aria-hidden="true" />
      </span>
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-xs text-sm text-quiet">{children}</p>}
      {action && (
        <Link to={action.to} className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800">
          {action.label}
        </Link>
      )}
    </div>
  );
}
