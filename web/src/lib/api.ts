import { useEffect, useState } from 'react';

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** POSTs JSON (or nothing) and returns the JSON answer. Errors carry the server's friendly message. */
export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0);
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ApiError(data?.error ?? `Something went wrong (${res.status})`, res.status);
  return data as T;
}

export type ApiState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

/** Loads `path` and reloads when it changes. */
export function useApi<T>(path: string): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getJson<T>(path).then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : 'Something went wrong' }),
    );
    return () => {
      cancelled = true;
    };
  }, [path]);
  return state;
}
