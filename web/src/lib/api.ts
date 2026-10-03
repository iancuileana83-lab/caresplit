import { useEffect, useState } from 'react';
import { apiHeaders } from './visitor';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: apiHeaders() });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

/** POSTs JSON (or nothing) and returns the JSON answer. Errors carry the server's friendly message. */
export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: apiHeaders(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0);
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ApiError(data?.error ?? `Something went wrong (${res.status})`, res.status);
  return data as T;
}

/** PUTs JSON and returns the JSON answer. Errors carry the server's friendly message. */
export async function putJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'PUT', headers: apiHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0);
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ApiError(data?.error ?? `Something went wrong (${res.status})`, res.status);
  return data as T;
}

export type ApiState<T> =
  | { status: 'loading' }
  /** `code` is the HTTP status when the server answered (404 means "not there"), and absent when it could not be reached. */
  | { status: 'error'; message: string; code?: number; retry: () => void }
  | { status: 'ready'; data: T };

export interface ApiOptions<T> {
  /** Look again every this many milliseconds while the tab is visible (and `pollWhile` says to). */
  pollMs?: number;
  /** Polling continues only while this returns true for the data on screen. */
  pollWhile?: (data: T) => boolean;
}

/**
 * Loads `path` and reloads when it changes. An error carries a `retry` that loads it again.
 * With `pollMs` it also checks again from time to time, quietly: no loading flash, and a failed
 * check keeps what is on screen.
 */
export function useApi<T>(path: string, options: ApiOptions<T> = {}): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const shown = state.status === 'ready' ? state.data : null;
  const { pollMs, pollWhile } = options;

  useEffect(() => {
    if (!pollMs || shown === null || (pollWhile && !pollWhile(shown))) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const data = await getJson<T>(path);
        if (!cancelled) setState((prev) => (prev.status === 'ready' && JSON.stringify(prev.data) === JSON.stringify(data) ? prev : { status: 'ready', data }));
      } catch {
        /* keep showing what we have; the next check may work */
      }
    }, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, shown, pollMs]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getJson<T>(path).then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (err: unknown) =>
        !cancelled &&
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Something went wrong',
          code: err instanceof ApiError && err.status > 0 ? err.status : undefined,
          retry: () => setAttempt((n) => n + 1),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [path, attempt]);
  return state;
}
