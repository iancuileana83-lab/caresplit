import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A modal confirmation built on the native <dialog>: focus is trapped and Escape cancels. */
export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-white p-5 text-ink backdrop:bg-black/40"
    >
      <h2 id="confirm-title" className="text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-2 text-sm text-quiet">{children}</div>
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" onClick={onConfirm} className="min-h-12 rounded-2xl bg-teal-700 px-4 text-[15px] font-medium text-white hover:bg-teal-800">
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 rounded-2xl border border-line px-4 text-[15px] font-medium hover:bg-stone-50">
          Cancel
        </button>
      </div>
    </dialog>
  );
}
