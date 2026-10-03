import { careCreditRule, type CareCredit } from '../../../shared/care';
import { formatPercent, parsePercent, validateRule, type SplitRule } from '../../../shared/split';

/** The care credit as the Family form edits it. People are named by their row key (see Family.tsx). */
export interface CareForm {
  enabled: boolean;
  caregiverKey: string;
  /** The credit as typed, for example "25". */
  percent: string;
}

export const DEFAULT_CREDIT_PERCENT = '25';

export function toCareForm(credit: CareCredit | null, fallbackCaregiverKey: string): CareForm {
  return credit
    ? { enabled: true, caregiverKey: credit.caregiverId, percent: formatPercent(credit.basisPoints) }
    : { enabled: false, caregiverKey: fallbackCaregiverKey, percent: DEFAULT_CREDIT_PERCENT };
}

/** What is wrong with the care credit part of the form, in words for the screen, or null. */
export function careProblem(care: CareForm, keys: string[]): string | null {
  if (!care.enabled) return null;
  if (!keys.includes(care.caregiverKey)) return 'Choose the main caregiver.';
  if (parsePercent(care.percent) === null) return 'Enter the care credit as a percentage, like 25.';
  return null;
}

/** What the server receives: null when off, otherwise the caregiver (by id) and the credit in basis points. */
export function carePayload(care: CareForm, idOf: (key: string) => string): CareCredit | null {
  if (!care.enabled) return null;
  return { caregiverId: idOf(care.caregiverKey), basisPoints: parsePercent(care.percent) ?? -1 };
}

/** The split a receipt would get with this credit on top of `rule`, as "name, percent" lines. Null when it cannot be shown. */
export function carePreview(care: CareForm, rule: SplitRule, rows: { key: string; name: string }[]): { name: string; percent: string }[] | null {
  if (!care.enabled) return null;
  const bp = parsePercent(care.percent);
  const keys = rows.map((r) => r.key);
  if (bp === null || bp === 0 || !keys.includes(care.caregiverKey) || validateRule(rule, keys) !== null) return null;
  const effective = careCreditRule(rule, keys, { caregiverId: care.caregiverKey, basisPoints: bp });
  return rows.map((r) => ({ name: r.name || 'New member', percent: formatPercent(effective.basisPoints[r.key]) }));
}
