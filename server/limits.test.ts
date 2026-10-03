import { describe, expect, it } from 'vitest';
import { createLimiter } from './limits';

describe('createLimiter', () => {
  it('limits each visitor per minute and lets them back in later', () => {
    let t = 0;
    const check = createLimiter({ perIpPerMinute: 2, perDay: 100, now: () => t });
    expect(check('a').ok).toBe(true);
    expect(check('a').ok).toBe(true);
    expect(check('a')).toEqual({ ok: false, reason: 'rate' });
    expect(check('b').ok).toBe(true);
    t = 61_000;
    expect(check('a').ok).toBe(true);
  });

  it('caps the whole app per day and resets the next day', () => {
    let t = Date.UTC(2026, 9, 3, 12);
    const check = createLimiter({ perIpPerMinute: 10, perDay: 3, now: () => t });
    expect(check('a').ok && check('b').ok && check('c').ok).toBe(true);
    expect(check('d')).toEqual({ ok: false, reason: 'daily' });
    t = Date.UTC(2026, 9, 4, 0, 1);
    expect(check('d').ok).toBe(true);
  });
});
