import { describe, expect, it } from 'vitest';
import { carePayload, careProblem, carePreview, toCareForm } from './care-form';

const rows = [
  { key: 'anna', name: 'Anna' },
  { key: 'ben', name: 'Ben' },
  { key: 'clara', name: 'Clara' },
];
const keys = rows.map((r) => r.key);
const on = { enabled: true, caregiverKey: 'ben', percent: '25' };

describe('care credit form', () => {
  it('starts switched off with a sensible default, or from the saved credit', () => {
    expect(toCareForm(null, 'ben')).toEqual({ enabled: false, caregiverKey: 'ben', percent: '25' });
    expect(toCareForm({ caregiverId: 'clara', basisPoints: 1250 }, 'ben')).toEqual({ enabled: true, caregiverKey: 'clara', percent: '12.5' });
  });

  it('checks the caregiver and the percentage only when it is on', () => {
    expect(careProblem({ ...on, enabled: false, percent: 'abc' }, keys)).toBeNull();
    expect(careProblem(on, keys)).toBeNull();
    expect(careProblem({ ...on, caregiverKey: 'zoe' }, keys)).toBe('Choose the main caregiver.');
    for (const bad of ['', 'abc', '101', '12.345']) expect(careProblem({ ...on, percent: bad }, keys), bad).toBe('Enter the care credit as a percentage, like 25.');
  });

  it('builds what the server expects, naming people by id', () => {
    expect(carePayload({ ...on, enabled: false }, (k) => k)).toBeNull();
    expect(carePayload(on, (k) => `id-${k}`)).toEqual({ caregiverId: 'id-ben', basisPoints: 2500 });
    expect(carePayload({ ...on, percent: '33.5' }, (k) => k)?.basisPoints).toBe(3350);
  });

  it('previews the split the credit would produce', () => {
    expect(carePreview(on, { type: 'equal' }, rows)).toEqual([
      { name: 'Anna', percent: '37.5' },
      { name: 'Ben', percent: '25' },
      { name: 'Clara', percent: '37.5' },
    ]);
  });

  it('shows no preview when there is nothing to show', () => {
    expect(carePreview({ ...on, enabled: false }, { type: 'equal' }, rows)).toBeNull();
    expect(carePreview({ ...on, percent: '0' }, { type: 'equal' }, rows)).toBeNull();
    expect(carePreview({ ...on, percent: 'x' }, { type: 'equal' }, rows)).toBeNull();
    expect(carePreview({ ...on, caregiverKey: 'zoe' }, { type: 'equal' }, rows)).toBeNull();
    expect(carePreview(on, { type: 'percent', basisPoints: { anna: 5000, ben: 3000, clara: 1000 } }, rows)).toBeNull(); // percentages do not add up yet
  });
});
