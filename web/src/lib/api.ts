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

export type ApiState<T> = { status: 'loading' } | { status: 'error'; message: string; retry: () => void } | { status: 'ready'; data: T };

/** Loads `path` and reloads when it changes. An error carries a `retry` that loads it again. */
export function useApi<T>(path: string): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getJson<T>(path).then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (err: unknown) =>
        !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : 'Something went wrong', retry: () => setAttempt((n) => n + 1) }),
    );
    return () => {
      cancelled = true;
    };
  }, [path, attempt]);
  return state;
}
