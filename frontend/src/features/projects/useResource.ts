import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';

type ResourceState<T> = { key: string; status: 'loading' | 'ready' | 'error'; data?: T; errorStatus?: number };

export function useResource<T>(path: string | null): { status: 'loading' | 'ready' | 'error'; data?: T; errorStatus?: number; reload: () => void } {
  const key = path ?? '';
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ key, status: 'loading' });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState({ key, status: 'loading' });
    apiRequest<T>(path, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ key, status: 'ready', data }); })
      .catch(error => {
        if (controller.signal.aborted) return;
        setState({ key, status: 'error', errorStatus: error instanceof ApiError ? error.status : undefined });
      });
    return () => controller.abort();
  }, [key, path, version]);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  if (!path) return { status: 'loading', data: undefined, reload };
  const current = state.key === key ? state : { key, status: 'loading' as const };
  return { ...current, reload };
}

export async function sendJson<T>(path: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  return apiRequest<T>(path, { method, body: JSON.stringify(body) });
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}
