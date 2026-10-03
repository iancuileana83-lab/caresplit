const labels = ['Photo', 'Check', 'Split'];

/** Three-step progress bar for adding a receipt. `current` is 1, 2 or 3. */
export function Steps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div>
      <div className="flex gap-1.5" aria-hidden="true">
        {labels.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i < current ? 'bg-teal-700' : 'bg-stone-300'}`} />
        ))}
      </div>
      <p className="mt-2 text-xs text-quiet">
        Step {current} of 3 · {labels[current - 1]}
      </p>
    </div>
  );
}
