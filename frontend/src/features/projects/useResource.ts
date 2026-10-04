import { useCallback, useEffect, useState } from 'react';

type ResourceState<T> = { key: string; status: 'loading' | 'ready' | 'error'; data?: T; errorStatus?: number };

export function useResource<T>(path: string | null): { status: 'loading' | 'ready' | 'error'; data?: T; errorStatus?: number; reload: () => void } {
  const key = path ?? '';
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ key, status: 'loading' });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState({ key, status: 'loading' });
    let errorStatus: number | undefined;
    fetch(`/api/v1${path}`, { credentials: 'same-origin', signal: controller.signal })
      .then(response => {
        if (!response.ok) {
          errorStatus = response.status;
          throw new Error('request_failed');
        }
        return response.json() as Promise<T>;
      })
      .then(data => setState({ key, status: 'ready', data }))
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ key, status: 'error', errorStatus });
      });
    return () => controller.abort();
  }, [key, path, version]);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  if (!path) return { status: 'loading', data: undefined, reload };
  const current = state.key === key ? state : { key, status: 'loading' as const };
  return { ...current, reload };
}

export async function sendJson<T>(path: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('request_failed');
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}
