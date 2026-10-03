import { useEffect, useId, useState } from 'react';
import { equalBasisPoints, formatPercent, parsePercent, validateRule, type SplitRule } from '../../../shared/split';

/** Stands for "the text is not a valid percentage": below zero, so the rule check rejects it. */
export const INVALID_PERCENT = -1;

export interface RuleMember {
  /** The key the rule uses for this person (a member id, or a temporary key for someone not saved yet). */
  key: string;
  name: string;
}

/** What is wrong with the rule, in words for the screen, or null. */
export function ruleProblem(rule: SplitRule, members: RuleMember[]): string | null {
  if (rule.type === 'percent' && Object.values(rule.basisPoints).some((v) => v < 0)) return 'Enter each percentage as a number like 33.34.';
  const problem = validateRule(rule, members.map((m) => m.key));
  return problem ? `${problem}.` : null;
}

function PercentInput({ label, value, onChange }: { label: string; value: number; onChange: (bp: number) => void }) {
  const id = useId();
  const [text, setText] = useState(value >= 0 ? formatPercent(value) : '');
  // Follow changes made from outside (for example "Share equally"), but never overwrite what is being typed.
  useEffect(() => {
    const typed = parsePercent(text);
    if (value >= 0 ? typed !== value : typed !== null) setText(value >= 0 ? formatPercent(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm">
        {label}
      </label>
      <div className="relative w-28 shrink-0">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={value < 0}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parsePercent(e.target.value) ?? INVALID_PERCENT);
          }}
          className="min-h-11 w-full rounded-xl border border-line bg-white pl-3 pr-8 text-right text-base tabular-nums aria-[invalid=true]:border-red-500"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-quiet" aria-hidden="true">
          %
        </span>
      </div>
    </div>
  );
}

interface Props {
  members: RuleMember[];
  value: SplitRule;
  onChange: (rule: SplitRule) => void;
}

/** Choose equal shares or custom percentages, with a live check that the percentages add up to 100. */
export function SplitRuleEditor({ members, value, onChange }: Props) {
  const name = useId();
  const keys = members.map((m) => m.key);
  const problem = ruleProblem(value, members);

  const choosePercent = () => {
    if (value.type === 'percent') return;
    onChange({ type: 'percent', basisPoints: equalBasisPoints(keys) });
  };

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="How to split" className="grid grid-cols-2 gap-2">
        {(
          [
            { id: 'equal', label: 'Equal shares' },
            { id: 'percent', label: 'Custom percentages' },
          ] as const
        ).map((option) => {
          const active = value.type === option.id;
          return (
            <label
              key={option.id}
              className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm focus-within:outline-2 focus-within:outline-teal-700 ${
                active ? 'border-teal-700 bg-teal-50 font-medium text-teal-800' : 'border-line bg-white'
              }`}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={active}
                onChange={() => (option.id === 'equal' ? onChange({ type: 'equal' }) : choosePercent())}
              />
              {option.label}
            </label>
          );
        })}
      </div>

      {value.type === 'percent' && (
        <div className="space-y-2">
          {members.map((m) => (
            <PercentInput
              key={m.key}
              label={m.name || 'New member'}
              value={value.basisPoints[m.key] ?? 0}
              onChange={(bp) => onChange({ type: 'percent', basisPoints: { ...value.basisPoints, [m.key]: bp } })}
            />
          ))}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p role="status" className={`text-sm ${problem ? 'text-amber-800' : 'text-green-800'}`}>
              {problem ?? 'The percentages add up to 100%.'}
            </p>
            <button
              type="button"
              onClick={() => onChange({ type: 'percent', basisPoints: equalBasisPoints(keys) })}
              className="min-h-11 shrink-0 px-1 text-sm font-medium text-teal-700 underline underline-offset-2"
            >
              Share equally
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
