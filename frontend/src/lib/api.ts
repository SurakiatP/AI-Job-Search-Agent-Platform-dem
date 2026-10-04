import { useEffect, useState } from 'react';
import { ApiError, type ApiErrorBody, type OwnerSessionState } from './api-types';

const API_BASE = '/api/v1';
const CSRF_HEADER = 'X-CSRF-Token';
let csrfToken: string | null = null;
let ownerSessionPromise: Promise<OwnerSessionState> | null = null;
let ownerSessionState: OwnerSessionState = { status: 'loading' };
const ownerSessionListeners = new Set<(state: OwnerSessionState) => void>();

function publishOwnerSession(state: OwnerSessionState) {
  ownerSessionState = state;
  ownerSessionListeners.forEach(listener => listener(state));
}

function safeNonceFromFragment(): string | null {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const nonce = fragment.get('owner-nonce');
  if (nonce) {
    // Remove launch credentials before starting any network request.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    return nonce;
  }
  return null;
}

// Strip launch material while the app module is evaluated, before the first API request or UI render.
let launchNonce = safeNonceFromFragment();

async function responseError(response: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | undefined;
  try {
    const value: unknown = await response.json();
    if (value && typeof value === 'object') body = value as Partial<ApiErrorBody>;
  } catch {
    body = undefined;
  }
  return new ApiError(response.status, body);
}

async function bootstrapOwnerSession(): Promise<OwnerSessionState> {
  const nonce = launchNonce;
  launchNonce = null;
  const response = await fetch(`${API_BASE}/owner/${nonce ? 'bootstrap' : 'session'}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: nonce ? { 'Content-Type': 'application/json' } : undefined,
    body: nonce ? JSON.stringify({ nonce }) : undefined,
    cache: 'no-store',
  });
  if (!response.ok) throw await responseError(response);
  const value = await response.json() as { authenticated: true; csrf_token: string; expires_at: string };
  if (value.authenticated !== true || typeof value.csrf_token !== 'string') throw new ApiError(500);
  csrfToken = value.csrf_token;
  return { status: 'ready', expires_at: value.expires_at };
}

export function initializeOwnerSession(): Promise<OwnerSessionState> {
  if (!ownerSessionPromise) {
    ownerSessionPromise = bootstrapOwnerSession()
      .then(state => { publishOwnerSession(state); return state; })
      .catch(error => {
        const safeError = error instanceof ApiError ? error : new ApiError(0);
        csrfToken = null;
        const state: OwnerSessionState = { status: 'error', error: safeError };
        publishOwnerSession(state);
        return state;
      });
  }
  return ownerSessionPromise;
}

export function useOwnerSession(): OwnerSessionState {
  const [state, setState] = useState<OwnerSessionState>(ownerSessionState);
  useEffect(() => {
    ownerSessionListeners.add(setState);
    setState(ownerSessionState);
    void initializeOwnerSession();
    return () => { ownerSessionListeners.delete(setState); };
  }, []);
  return state;
}

function isWrite(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await initializeOwnerSession();
  if (session.status === 'error') throw session.error;
  if (session.status !== 'ready') throw new ApiError(0, { code: 'session_loading', message_key: 'errors.unauthorized', retryable: true });
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);
  if (isWrite(method)) {
    if (!csrfToken) throw new ApiError(401, { code: 'unauthorized', message_key: 'errors.unauthorized' });
    headers.set(CSRF_HEADER, csrfToken);
    if (init.body instanceof FormData) headers.delete('Content-Type');
    else if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      method,
      headers,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, { code: 'network_error', message_key: 'errors.network_error', retryable: true });
  }
  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return undefined as T;
  if (response.headers.get('Content-Type')?.includes('application/json')) return await response.json() as T;
  return await response.blob() as T;
}
