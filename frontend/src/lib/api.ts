import { useEffect, useState } from 'react';
import { ApiError, type Account, type AccountAgent, type ApiErrorBody, type OwnerSessionState } from './api-types';

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

type SessionBody = { csrf_token: string; expires_at: string; user: Account };

async function bootstrapOwnerSession(): Promise<OwnerSessionState> {
  const response = await fetch(`${API_BASE}/auth/session`, { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) return { status: 'anonymous' };
  if (!response.ok) throw await responseError(response);
  const value = await response.json() as Partial<SessionBody>;
  if (typeof value.csrf_token !== 'string' || !value.user) throw new ApiError(500);
  csrfToken = value.csrf_token;
  return { status: 'ready', expires_at: String(value.expires_at), user: value.user };
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

export function refreshOwnerSession(): Promise<OwnerSessionState> {
  ownerSessionPromise = null;
  return initializeOwnerSession();
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

export function useAccount(): Account | null {
  const session = useOwnerSession();
  return session.status === 'ready' ? session.user : null;
}

function setSession(state: OwnerSessionState) {
  ownerSessionPromise = Promise.resolve(state);
  publishOwnerSession(state);
}

// Auth endpoints run before (or while ending) a session, so they bypass the session gate in apiRequest.
async function authRequest<T>(path: string, body?: unknown, write = false): Promise<T> {
  const headers = new Headers();
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (write && csrfToken) headers.set(CSRF_HEADER, csrfToken);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, credentials: 'same-origin', cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, { code: 'network_error', message_key: 'errors.network_error', retryable: true });
  }
  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export async function login(email: string, password: string): Promise<void> {
  const value = await authRequest<{ user: Account; csrf_token: string }>('/auth/login', { email, password });
  csrfToken = value.csrf_token;
  setSession({ status: 'ready', expires_at: '', user: value.user });
}
export async function logout(): Promise<void> {
  await authRequest<void>('/auth/logout', undefined, true).catch(() => undefined);
  csrfToken = null;
  setSession({ status: 'anonymous' });
}
export const signup = (email: string, password: string, locale: 'th' | 'en') => authRequest<{ status: 'check_email' }>('/auth/signup', { email, password, locale });
export const verifyEmail = (token: string) => authRequest<void>('/auth/verify-email', { token });
export const resendVerification = () => authRequest<{ status: 'check_email' }>('/auth/resend-verification');
export const forgotPassword = (email: string) => authRequest<{ status: 'check_email' }>('/auth/password/forgot', { email });
export const resetPassword = (token: string, password: string) => authRequest<void>('/auth/password/reset', { token, password });
export const getAccount = () => apiRequest<Account>('/account');
export const listAccountAgents = () => apiRequest<AccountAgent[]>('/account/agents');
export async function deleteAccount(password: string, confirmEmail: string): Promise<void> {
  await apiRequest<void>('/account', { method: 'DELETE', body: JSON.stringify({ password, confirm_email: confirmEmail }) });
  csrfToken = null;
  setSession({ status: 'anonymous' });
}

function isWrite(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await initializeOwnerSession();
  if (session.status === 'error') throw session.error;
  if (session.status === 'anonymous') throw new ApiError(401, { code: 'unauthorized', message_key: 'errors.unauthorized' });
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
  if (response.status === 401) { csrfToken = null; setSession({ status: 'anonymous' }); }
  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return undefined as T;
  if (response.headers.get('Content-Type')?.includes('application/json')) return await response.json() as T;
  return await response.blob() as T;
}
