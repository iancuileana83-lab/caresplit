import { HeartHandshake } from 'lucide-react';
import { useId } from 'react';
import type { SplitRule } from '../../../shared/split';
import { carePreview, type CareForm } from '../lib/care-form';

interface Props {
  value: CareForm;
  onChange: (care: CareForm) => void;
  /** Everyone in the family, by the key the form uses. */
  members: { key: string; name: string }[];
  /** The family's normal split, which the credit is applied on top of. */
  rule: SplitRule;
}

/** Switch on a care credit: the sibling who gives time pays a smaller share, and the others share the difference. */
export function CareCreditEditor({ value, onChange, members, rule }: Props) {
  const id = useId();
  const preview = carePreview(value, rule, members);
  const caregiver = members.find((m) => m.key === value.caregiverKey)?.name || 'the caregiver';

  return (
    <div className="space-y-3">
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} className="mt-1 size-5 accent-teal-700" />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <HeartHandshake size={18} className="text-teal-700" aria-hidden="true" />
            Give the main caregiver a care credit
          </span>
          <span className="block text-sm text-quiet">
            The sibling who gives time (pharmacy runs, appointments, time with your parent) pays a smaller share. The part they do not pay is shared by the others.
          </span>
        </span>
      </label>

      {value.enabled && (
        <div className="space-y-3 pl-8">
          <div>
            <label htmlFor={`${id}-who`} className="mb-1 block text-xs text-quiet">
              Main caregiver
            </label>
            <select
              id={`${id}-who`}
              value={value.caregiverKey}
              onChange={(e) => onChange({ ...value, caregiverKey: e.target.value })}
              className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base"
            >
              {members.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name || 'New member'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-pct`} className="mb-1 block text-xs text-quiet">
              Care credit
            </label>
            <div className="relative w-32">
              <input
                id={`${id}-pct`}
                inputMode="decimal"
                autoComplete="off"
                value={value.percent}
                onChange={(e) => onChange({ ...value, percent: e.target.value })}
                className="min-h-11 w-full rounded-xl border border-line bg-white pl-3 pr-8 text-right text-base tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-quiet" aria-hidden="true">
                %
              </span>
            </div>
            <p className="mt-1 text-xs text-quiet">
              {value.percent || '0'}% means {caregiver} pays {value.percent || '0'}% less than their normal share.
            </p>
          </div>
          {preview && (
            <div role="status" className="rounded-xl bg-teal-50 px-3 py-2.5 text-sm text-teal-900">
              <p className="font-medium">A receipt would be split like this</p>
              <ul className="mt-1">
                {preview.map((p) => (
                  <li key={p.name} className="flex justify-between">
                    <span>{p.name}</span>
                    <span className="tabular-nums">{p.percent}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
