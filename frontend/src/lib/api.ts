import { useEffect, useState } from 'react';
import {
  ApiError, type Account, type AccountAgent, type AdminAuditPage, type AdminAuditQuery, type AdminBenchmark, type AdminBenchmarkCreate, type AdminBucket,
  type AdminMetric, type AdminModelCatalogItem, type AdminModelCreate, type AdminModelPrice, type AdminOverview, type AdminFxRate, type AdminPrefs, type AdminRange,
  type AdminRegisteredModel, type AdminRunDetail, type AdminRunPage, type AdminRunsQuery, type AdminSystem, type AdminTaskSetting, type AdminTaskUpdate,
  type AdminUsage, type AdminUsageGroup, type AdminUserDetail, type AdminUserPage, type AdminUsersQuery, type AdminWebhookDelivery, type ApiErrorBody,
  type OwnerSessionState,
} from './api-types';

const API_BASE = '/v1';
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
  try { Object.keys(localStorage).filter(k => k.startsWith('cvb-draft:')).forEach(k => localStorage.removeItem(k)); } catch { /* storage blocked */ }
  setSession({ status: 'anonymous', loggedOut: true });
}
export type CheckEmail = { status: 'check_email'; mail_enabled?: boolean };
export const signup = (email: string, password: string, locale: 'th' | 'en') => authRequest<CheckEmail>('/auth/signup', { email, password, locale });
export const verifyEmail = (token: string) => authRequest<void>('/auth/verify-email', { token });
export const verifyEmailCode = (email: string, code: string) => authRequest<void>('/auth/verify-email/code', { email, code });
export const unsubscribeDigest = (token: string) => authRequest<void>('/digest/unsubscribe', { token });
export const resendVerification = () => authRequest<CheckEmail>('/auth/resend-verification');
export const forgotPassword = (email: string) => authRequest<CheckEmail>('/auth/password/forgot', { email });
export const resetPassword = (token: string, password: string) => authRequest<void>('/auth/password/reset', { token, password });
export const changePassword = (current_password: string, new_password: string) => apiRequest<void>('/auth/password/change', { method: 'POST', body: JSON.stringify({ current_password, new_password }) });
export const uploadAvatar = (file: File) => apiRequest<void>('/account/avatar', { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
export const removeAvatar = () => apiRequest<void>('/account/avatar', { method: 'DELETE' });
export const chooseAvatarPreset = (preset: string) => apiRequest<void>('/account/avatar-preset', { method: 'PUT', body: JSON.stringify({ preset }) });
export const getAccount = () => apiRequest<Account>('/account');
export const listAccountAgents = () => apiRequest<AccountAgent[]>('/account/agents');
export const sendDeletionCode = () => apiRequest<CheckEmail>('/account/delete-code', { method: 'POST' });
export async function deleteAccount(password: string, confirmEmail: string, code: string): Promise<void> {
  await apiRequest<void>('/account', { method: 'DELETE', body: JSON.stringify({ password, confirm_email: confirmEmail, code }) });
  csrfToken = null; // caller reloads the app, which drops all session state
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
  if (!response.ok) {
    const error = await responseError(response);
    // Only a missing or expired session ends the login; other 401s (e.g. wrong password) are ordinary errors.
    if (response.status === 401 && error.code === 'unauthorized') { csrfToken = null; setSession({ status: 'anonymous' }); }
    throw error;
  }
  if (response.status === 204) return undefined as T;
  if (response.headers.get('Content-Type')?.includes('application/json')) return await response.json() as T;
  return await response.blob() as T;
}

// Admin console. Every route answers 403 forbidden to non-admins; 403 admin_target_forbidden when the target is an admin account.
function adminQuery(params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value || value === 0) query.set(key, String(value));
  const text = query.toString();
  return text ? `?${text}` : '';
}
const adminJson = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const admin = {
  overview: (range: AdminRange) => apiRequest<AdminOverview>(`/admin/overview${adminQuery({ range })}`),
  bucket: (range: AdminRange, metric: AdminMetric, start: string) => apiRequest<AdminBucket>(`/admin/overview/bucket${adminQuery({ range, metric, start })}`),
  overviewCsv: (range: AdminRange) => apiRequest<Blob>(`/admin/overview.csv${adminQuery({ range })}`),
  fx: () => apiRequest<AdminFxRate>('/admin/fx'),
  getPrefs: () => apiRequest<AdminPrefs>('/admin/prefs'),
  savePrefs: (prefs: AdminPrefs) => apiRequest<AdminPrefs>('/admin/prefs', adminJson('PUT', prefs)),
  users: (query: AdminUsersQuery = {}) => apiRequest<AdminUserPage>(`/admin/users${adminQuery({ ...query })}`),
  user: (id: string) => apiRequest<AdminUserDetail>(`/admin/users/${id}`),
  suspendUser: (id: string) => apiRequest<AdminUserDetail>(`/admin/users/${id}/suspend`, adminJson('POST')),
  enableUser: (id: string) => apiRequest<AdminUserDetail>(`/admin/users/${id}/enable`, adminJson('POST')),
  resetUserPassword: (id: string) => apiRequest<void>(`/admin/users/${id}/reset-password`, adminJson('POST')),
  deleteUser: (id: string, confirmEmail: string) => apiRequest<void>(`/admin/users/${id}/delete`, adminJson('POST', { confirm_email: confirmEmail })),
  runs: (query: AdminRunsQuery = {}) => apiRequest<AdminRunPage>(`/admin/runs${adminQuery({ ...query })}`),
  run: (id: string) => apiRequest<AdminRunDetail>(`/admin/runs/${id}`),
  cancelRun: (id: string) => apiRequest<AdminRunDetail>(`/admin/runs/${id}/cancel`, adminJson('POST')),
  retryRun: (id: string) => apiRequest<AdminRunDetail>(`/admin/runs/${id}/retry`, adminJson('POST')),
  usage: (range: AdminRange, groupBy: AdminUsageGroup) => apiRequest<AdminUsage>(`/admin/usage${adminQuery({ range, group_by: groupBy })}`),
  modelCatalog: (q?: string) => apiRequest<AdminModelCatalogItem[]>(`/admin/models/catalog${adminQuery({ q })}`),
  models: () => apiRequest<AdminRegisteredModel[]>('/admin/models'),
  addModel: (body: AdminModelCreate) => apiRequest<AdminRegisteredModel>('/admin/models', adminJson('POST', body)),
  deleteModel: (model: string) => apiRequest<void>('/admin/models', adminJson('DELETE', { model })),
  setModelPrice: (body: AdminModelPrice) => apiRequest<AdminRegisteredModel>('/admin/models/price', adminJson('PUT', body)),
  useOfficialPrice: (model: string) => apiRequest<AdminRegisteredModel>('/admin/models/use-official-price', adminJson('POST', { model })),
  tasks: () => apiRequest<AdminTaskSetting[]>('/admin/tasks'),
  setTask: (operation: string, body: AdminTaskUpdate) => apiRequest<AdminTaskSetting>(`/admin/tasks/${operation}`, adminJson('PUT', body)),
  benchmarks: (operation?: string) => apiRequest<AdminBenchmark[]>(`/admin/benchmarks${adminQuery({ operation })}`),
  benchmark: (id: string) => apiRequest<AdminBenchmark>(`/admin/benchmarks/${id}`),
  startBenchmark: (body: AdminBenchmarkCreate) => apiRequest<AdminBenchmark>('/admin/benchmarks', adminJson('POST', body)),
  system: (range?: AdminRange) => apiRequest<AdminSystem>(`/admin/system${adminQuery({ range })}`),
  webhooks: (status?: AdminWebhookDelivery['status']) => apiRequest<AdminWebhookDelivery[]>(`/admin/webhooks${adminQuery({ status })}`),
  resendWebhook: (id: string) => apiRequest<AdminWebhookDelivery>(`/admin/webhooks/${id}/resend`, adminJson('POST')),
  audit: (query: AdminAuditQuery = {}) => apiRequest<AdminAuditPage>(`/admin/audit${adminQuery({ ...query })}`),
};
