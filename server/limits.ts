// A small in-memory limiter that protects the public demo's Gemini key from abuse:
// a few reads per minute per visitor and a cap per day for the whole app.
// (Memory is per container; with at most 2 Cloud Run instances this is a good enough guard.)

export interface LimiterOptions {
  perIpPerMinute: number;
  perDay: number;
  now?: () => number;
}

export type LimitResult = { ok: true } | { ok: false; reason: 'rate' | 'daily' };

export function createLimiter({ perIpPerMinute, perDay, now = Date.now }: LimiterOptions) {
  const recent = new Map<string, number[]>();
  let day = '';
  let dayCount = 0;

  return function check(ip: string): LimitResult {
    const t = now();
    const today = new Date(t).toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      dayCount = 0;
    }
    if (dayCount >= perDay) return { ok: false, reason: 'daily' };

    const hits = (recent.get(ip) ?? []).filter((h) => t - h < 60_000);
    if (hits.length >= perIpPerMinute) {
      recent.set(ip, hits);
      return { ok: false, reason: 'rate' };
    }
    hits.push(t);
    recent.set(ip, hits);
    dayCount += 1;
    if (recent.size > 5000) for (const [k, v] of recent) if (v.every((h) => t - h >= 60_000)) recent.delete(k);
    return { ok: true };
  };
}

export function limiterFromEnv(env: NodeJS.ProcessEnv) {
  return createLimiter({
    perIpPerMinute: Number(env.READ_LIMIT_PER_MINUTE) || 6,
    perDay: Number(env.READ_LIMIT_PER_DAY) || 300,
  });
}
