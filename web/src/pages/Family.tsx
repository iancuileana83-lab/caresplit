import { Card } from '../components/Card';
import { useViewAs } from '../lib/view-as';

export function Family() {
  const { family, viewer } = useViewAs();
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
    </div>
  );
}
