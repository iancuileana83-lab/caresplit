const KEY = 'caresplit:visitor';

let inMemory: string | null = null;

/**
 * A random id this browser makes up the first time and keeps. It names the visitor's own demo
 * family on the server, so nobody else sees their receipts. (If the browser blocks storage, the id
 * lives until the page is reloaded.)
 */
export function visitorId(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return (inMemory ??= crypto.randomUUID());
  }
}

/** Headers every call to the API carries. */
export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-Visitor-Id': visitorId(), ...extra };
}
