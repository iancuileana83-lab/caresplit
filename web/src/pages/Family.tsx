import { CircleAlert, CircleCheck, LoaderCircle, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatPercent, type SplitRule } from '../../../shared/split';
import { MAX_MEMBERS, MIN_MEMBERS, type FamilyView } from '../../../shared/types';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CareCreditEditor } from '../components/CareCreditEditor';
import { ruleProblem, SplitRuleEditor } from '../components/SplitRuleEditor';
import { ApiError, postJson, putJson } from '../lib/api';
import { careProblem, carePayload, toCareForm, type CareForm } from '../lib/care-form';
import { useViewAs } from '../lib/view-as';

/** One row of the form. Saved members keep their id as the key; a new member gets a temporary key. */
interface Row {
  key: string;
  /** Present for a member that already exists on the server. */
  id?: string;
  name: string;
  accountId: string;
  role: 'organiser' | 'member';
}

interface Form {
  name: string;
  rows: Row[];
  rule: SplitRule;
  care: CareForm;
}

const SUGGESTED_NAMES = ['David', 'Eve', 'Frank', 'Grace'];
let tempCounter = 0;

function toForm(family: FamilyView): Form {
  return {
    name: family.name,
    rows: family.members.map((m) => ({ key: m.id, id: m.id, name: m.name, accountId: m.accountId, role: m.role })),
    rule: family.splitRule,
    care: toCareForm(family.careCredit, family.members.find((m) => m.role !== 'organiser')?.id ?? family.members[0].id),
  };
}

const sameForm = (a: Form, b: Form) => JSON.stringify(a) === JSON.stringify(b);

const fieldClass = 'min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base';

/** What the server will receive: new members have no id, and the rule names them `new-<position>`. */
function toPayload(form: Form) {
  const keyToRuleKey = new Map(form.rows.map((r, i) => [r.key, r.id ?? `new-${i}`]));
  const rule: SplitRule =
    form.rule.type === 'equal'
      ? form.rule
      : { type: 'percent', basisPoints: Object.fromEntries(form.rows.map((r) => [keyToRuleKey.get(r.key)!, form.rule.type === 'percent' ? (form.rule.basisPoints[r.key] ?? 0) : 0])) };
  return {
    name: form.name,
    members: form.rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), name: r.name, role: r.role, accountId: r.accountId })),
    splitRule: rule,
    careCredit: carePayload(form.care, (key) => keyToRuleKey.get(key) ?? key),
  };
}

function problemsOf(form: Form, family: FamilyView): string[] {
  const problems: string[] = [];
  if (form.name.trim() === '') problems.push('Give the family a name.');
  if (form.rows.some((r) => r.name.trim() === '')) problems.push('Every person needs a name.');
  const names = form.rows.map((r) => r.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) problems.push('Each person needs a different name.');
  const accounts = form.rows.map((r) => r.accountId);
  if (new Set(accounts).size !== accounts.length) problems.push('Each person needs a different PayPal sandbox account.');
  const rule = ruleProblem(form.rule, form.rows.map((r) => ({ key: r.key, name: r.name })));
  if (rule) problems.push(rule);
  const care = careProblem(form.care, form.rows.map((r) => r.key));
  if (care) problems.push(care);
  if (!family.accounts.length) problems.push('No PayPal sandbox accounts are available.');
  return problems;
}

export function Family() {
  const { family, viewer, updateFamily } = useViewAs();
  const organiser = viewer.role === 'organiser';
  const organiserName = family.members.find((m) => m.role === 'organiser')?.name;

  const [form, setForm] = useState<Form>(() => toForm(family));
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const dirty = !sameForm(form, toForm(family));

  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const change = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setSaved(false);
    setProblems([]);
  };
  const changeRow = (key: string, patch: Partial<Row>) => change({ rows: form.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });

  function addMember() {
    const used = new Set(form.rows.map((r) => r.accountId));
    const account = family.accounts.find((a) => !used.has(a.id));
    if (!account) return;
    const taken = new Set(form.rows.map((r) => r.name.trim().toLowerCase()));
    const name = SUGGESTED_NAMES.find((n) => !taken.has(n.toLowerCase())) ?? '';
    const key = `new-${++tempCounter}`;
    change({
      rows: [...form.rows, { key, name, accountId: account.id, role: 'member' }],
      rule: form.rule.type === 'percent' ? { type: 'percent', basisPoints: { ...form.rule.basisPoints, [key]: 0 } } : form.rule,
    });
  }

  function removeMember(key: string) {
    const rows = form.rows.filter((r) => r.key !== key);
    if (!rows.some((r) => r.role === 'organiser')) rows[0] = { ...rows[0], role: 'organiser' }; // someone must stay organiser
    let rule = form.rule;
    if (rule.type === 'percent') {
      const { [key]: _gone, ...rest } = rule.basisPoints;
      rule = { type: 'percent', basisPoints: rest };
    }
    // If the main caregiver leaves, the credit needs a new caregiver (the organiser can choose again).
    const care = form.care.caregiverKey === key ? { ...form.care, caregiverKey: rows.find((r) => r.role !== 'organiser')?.key ?? rows[0].key } : form.care;
    change({ rows, rule, care });
  }

  async function save() {
    const found = problemsOf(form, family);
    if (found.length > 0) return setProblems(found);
    setSaving(true);
    try {
      const result = await putJson<FamilyView>(`/api/family?as=${viewer.id}`, toPayload(form));
      updateFamily(result);
      setForm(toForm(result));
      setSaved(true);
    } catch (err) {
      setProblems([err instanceof ApiError ? err.message : 'Something went wrong.']);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setConfirming(false);
    setResetting(true);
    setResetError(null);
    try {
      await postJson(`/api/demo/reset?as=${viewer.id}`);
      window.location.assign('/'); // a full reload, so every screen starts from the fresh family
    } catch (err) {
      setResetting(false);
      setResetError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  const ruleMembers = form.rows.map((r) => ({ key: r.key, name: r.name }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{family.name}</h1>
        <p className="mt-0.5 text-quiet">
          {organiser ? 'Choose who is in the family and how pharmacy costs are split.' : `Only ${organiserName} can change the family. Switch to ${organiserName} to edit it.`}
        </p>
      </div>

      {!organiser ? (
        <>
          {family.careCredit && (
            <p className="rounded-xl bg-teal-50 px-3 py-2.5 text-sm text-teal-900">
              Care credit: {family.members.find((m) => m.id === family.careCredit?.caregiverId)?.name ?? 'The main caregiver'} gives time to care, so their share is{' '}
              {formatPercent(family.careCredit.basisPoints)}% lower and the others share the difference.
            </p>
          )}
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
        </>
      ) : (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <section aria-label="Family name">
            <label htmlFor="family-name" className="mb-1 block text-xs text-quiet">
              Family name
            </label>
            <input id="family-name" value={form.name} onChange={(e) => change({ name: e.target.value })} className={fieldClass} autoComplete="off" />
          </section>

          <section aria-label="Members">
            <h2 className="mb-2 text-sm font-semibold">
              People <span className="font-normal text-quiet">({form.rows.length} of {MAX_MEMBERS} at most)</span>
            </h2>
            <div className="space-y-3">
              {form.rows.map((r, index) => (
                <Card key={r.key} className="space-y-3 py-3">
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`name-${r.key}`} className="mb-1 block text-xs text-quiet">
                        Name
                      </label>
                      <input id={`name-${r.key}`} value={r.name} onChange={(e) => changeRow(r.key, { name: e.target.value })} className={fieldClass} autoComplete="off" maxLength={20} />
                    </div>
                    {form.rows.length > MIN_MEMBERS && (
                      <button
                        type="button"
                        aria-label={`Remove ${r.name || `person ${index + 1}`}`}
                        onClick={() => removeMember(r.key)}
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-quiet hover:bg-stone-100"
                      >
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <div>
                    <label htmlFor={`account-${r.key}`} className="mb-1 block text-xs text-quiet">
                      PayPal sandbox account (gets this person's invoices)
                    </label>
                    <select id={`account-${r.key}`} value={r.accountId} onChange={(e) => changeRow(r.key, { accountId: e.target.value })} className={fieldClass}>
                      {family.accounts.map((a) => {
                        const takenBy = form.rows.find((x) => x.key !== r.key && x.accountId === a.id);
                        return (
                          <option key={a.id} value={a.id}>
                            {a.label}
                            {takenBy ? ` (used by ${takenBy.name || 'someone'})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="organiser"
                      checked={r.role === 'organiser'}
                      onChange={() => change({ rows: form.rows.map((x) => ({ ...x, role: x.key === r.key ? 'organiser' : 'member' })) })}
                      className="size-5 accent-teal-700"
                    />
                    Organiser <span className="text-quiet">(usually pays at the pharmacy and gets no invoice)</span>
                  </label>
                </Card>
              ))}
            </div>
            {form.rows.length < MAX_MEMBERS && (
              <button type="button" onClick={addMember} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-teal-700">
                <Plus size={16} aria-hidden="true" />
                Add a person
              </button>
            )}
          </section>

          <section aria-label="Split">
            <h2 className="mb-2 text-sm font-semibold">How costs are split</h2>
            <Card>
              <SplitRuleEditor members={ruleMembers} value={form.rule} onChange={(rule) => change({ rule })} />
              <p className="mt-3 text-xs text-quiet">
                This is the default for new receipts. You can pick a different split for one receipt before sending. The organiser takes any odd cents.
              </p>
            </Card>
          </section>

          <section aria-label="Care credit">
            <h2 className="mb-2 text-sm font-semibold">Care credit</h2>
            <Card>
              <CareCreditEditor value={form.care} onChange={(care) => change({ care })} members={ruleMembers} rule={form.rule} />
            </Card>
          </section>

          {problems.length > 0 && (
            <div role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">
              <div className="flex items-center gap-2 font-medium">
                <CircleAlert size={18} aria-hidden="true" />
                Not saved yet
              </div>
              <ul className="mt-1 list-disc pl-7">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {saved && !dirty && (
            <div role="status" className="flex items-center gap-2 rounded-xl bg-green-100 px-3 py-2.5 text-sm font-medium text-green-800">
              <CircleCheck size={18} aria-hidden="true" />
              Family saved. New receipts use these settings; receipts you already made keep their shares.
            </div>
          )}

          <button type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 text-[15px] font-medium text-white hover:bg-teal-800">
            {saving && <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Save'}
          </button>
        </form>
      )}

      <section aria-label="Demo">
        <h2 className="mb-2 text-sm font-semibold">Your demo</h2>
        <Card>
          <p className="text-sm text-quiet">
            This family is yours alone: other visitors cannot see your receipts, and it is deleted by itself after a week. Start over with fresh
            sample receipts at any time. Invoices already sent in PayPal's sandbox stay there.
          </p>
          {organiser ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-stone-50"
            >
              {resetting ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}
              {resetting ? 'Resetting…' : 'Reset demo'}
            </button>
          ) : (
            <p className="mt-3 text-sm text-quiet">Switch to {organiserName} to reset the demo.</p>
          )}
          {resetError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {resetError}
            </p>
          )}
        </Card>
      </section>

      <ConfirmDialog open={confirming} title="Reset the demo?" confirmLabel="Reset demo" onConfirm={() => void reset()} onCancel={() => setConfirming(false)}>
        <p>Your receipts are removed and the family goes back to the three sample receipts and the original three people. This cannot be undone.</p>
      </ConfirmDialog>
    </div>
  );
}
