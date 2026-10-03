// Checks a family sent by the browser before it is saved: 2 to 4 members, exactly one organiser,
// each linked to a different PayPal sandbox account from the fixed list, and a split rule that
// matches exactly those members.
import { randomUUID } from 'node:crypto';
import { validateCareCredit, type CareCredit } from '../shared/care';
import { validateRule, type SplitRule } from '../shared/split';
import { MAX_MEMBERS, MIN_MEMBERS } from '../shared/types';
import { sandboxAccounts } from './demo-data';
import type { StoredFamily, StoredMember } from './store';

export interface FamilyUpdate {
  name: string;
  members: StoredMember[];
  splitRule: SplitRule;
  careCredit: CareCredit | null;
}

const MAX_NAME = 20;
const MAX_FAMILY_NAME = 40;

/** Letters, numbers, spaces and a few name marks; no markup or control characters. */
const NAME_OK = /^[\p{L}\p{N}][\p{L}\p{N} .'’-]*$/u;

export function parseFamilyUpdate(body: unknown, current: StoredFamily): { ok: true; value: FamilyUpdate } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Send the family as JSON' };
  const b = body as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 1 || name.length > MAX_FAMILY_NAME || !NAME_OK.test(name)) return { ok: false, error: `The family name must be 1 to ${MAX_FAMILY_NAME} letters or numbers` };

  if (!Array.isArray(b.members) || b.members.length < MIN_MEMBERS || b.members.length > MAX_MEMBERS) {
    return { ok: false, error: `A family has ${MIN_MEMBERS} to ${MAX_MEMBERS} members` };
  }

  const known = new Set(current.members.map((m) => m.id));
  const seenIds = new Set<string>();
  const members: StoredMember[] = [];
  for (const raw of b.members) {
    const m = raw as Record<string, unknown> | null;
    const memberName = typeof m?.name === 'string' ? m.name.trim() : '';
    if (memberName.length < 1 || memberName.length > MAX_NAME || !NAME_OK.test(memberName)) return { ok: false, error: `Each name must be 1 to ${MAX_NAME} letters or numbers` };
    if (m?.role !== 'organiser' && m?.role !== 'member') return { ok: false, error: 'Each person is the organiser or a member' };
    if (!sandboxAccounts.some((a) => a.id === m.accountId)) return { ok: false, error: 'Pick a PayPal sandbox account from the list' };

    // An existing member keeps their id; a new member (no id) gets a fresh one. Unknown ids are refused.
    let id: string;
    if (m.id === undefined || m.id === null || m.id === '') id = `m-${randomUUID().slice(0, 8)}`;
    else if (typeof m.id === 'string' && known.has(m.id)) id = m.id;
    else return { ok: false, error: 'Unknown family member' };
    if (seenIds.has(id)) return { ok: false, error: 'A member appears twice' };
    seenIds.add(id);

    members.push({ id, name: memberName, role: m.role, accountId: m.accountId as string });
  }

  if (members.filter((m) => m.role === 'organiser').length !== 1) return { ok: false, error: 'Exactly one person is the organiser' };
  const lowerNames = members.map((m) => m.name.toLowerCase());
  if (new Set(lowerNames).size !== members.length) return { ok: false, error: 'Each person needs a different name' };
  if (new Set(members.map((m) => m.accountId)).size !== members.length) return { ok: false, error: 'Each person needs a different PayPal sandbox account' };

  // The rule is checked against the new member list. A percentage rule must name every new member
  // (new members have no id yet, so the rule refers to them by their position as `new-0`, `new-1`...).
  const rule = remapRule(b.splitRule, b.members as Record<string, unknown>[], members);
  const problem = validateRule(rule, members.map((m) => m.id));
  if (problem) return { ok: false, error: problem };

  // The care credit names the caregiver by id, or `new-<position>` for a person who has no id yet.
  let careCredit: CareCredit | null = null;
  if (b.careCredit !== undefined && b.careCredit !== null) {
    const raw = b.careCredit as { caregiverId?: unknown; basisPoints?: unknown };
    const pos = typeof raw.caregiverId === 'string' ? /^new-(\d+)$/.exec(raw.caregiverId) : null;
    const index = pos ? Number(pos[1]) : -1;
    const caregiverId = index >= 0 && index < members.length && !(b.members as Record<string, unknown>[])[index]?.id ? members[index].id : raw.caregiverId;
    const creditProblem = validateCareCredit({ caregiverId, basisPoints: raw.basisPoints }, members.map((m) => m.id));
    if (creditProblem) return { ok: false, error: creditProblem };
    careCredit = { caregiverId: caregiverId as string, basisPoints: raw.basisPoints as number };
  }

  return { ok: true, value: { name, members, splitRule: rule as SplitRule, careCredit } };
}

/** Turns `new-<position>` keys in a percentage rule into the ids the new members just received. */
function remapRule(rule: unknown, rawMembers: Record<string, unknown>[], members: StoredMember[]): unknown {
  if (typeof rule !== 'object' || rule === null) return rule;
  const r = rule as { type?: unknown; basisPoints?: unknown };
  if (r.type !== 'percent' || typeof r.basisPoints !== 'object' || r.basisPoints === null) return rule;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(r.basisPoints as Record<string, unknown>)) {
    const m = /^new-(\d+)$/.exec(key);
    const index = m ? Number(m[1]) : -1;
    const target = index >= 0 && index < members.length && !rawMembers[index]?.id ? members[index].id : key;
    out[target] = value;
  }
  return { type: 'percent', basisPoints: out };
}
