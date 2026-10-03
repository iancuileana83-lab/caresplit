import { useViewAs } from '../lib/view-as';

/** Demo switcher: look at the app as Anna, Ben or Clara. There is no login in the demo. */
export function ViewAsSwitch() {
  const { family, viewer, setViewerId } = useViewAs();
  return (
    <div role="radiogroup" aria-label="View as" className="flex items-center rounded-full bg-mist p-1">
      <span className="px-3 text-xs text-quiet" aria-hidden="true">
        View as
      </span>
      {family.members.map((m) => {
        const active = m.id === viewer.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setViewerId(m.id)}
            className={`min-h-9 flex-1 rounded-full px-3 text-sm transition-colors ${
              active ? 'bg-teal-700 font-medium text-white' : 'text-stone-700 hover:bg-white/60'
            }`}
          >
            {m.name}
          </button>
        );
      })}
    </div>
  );
}
