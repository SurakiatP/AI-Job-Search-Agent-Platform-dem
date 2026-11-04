import type { Page } from '@playwright/test';
import { adminEmail } from './admin';

type User = { id: string; short_id: string; email: string; status: 'active' | 'suspended' | 'deleting'; email_verified: boolean; is_admin: boolean; created_at: string; last_seen_at: string | null; runs_in_range: number };

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const make = (n: number, over: Partial<User> = {}): User => ({ id: id(n), short_id: `u_${String(n).padStart(4, '0')}…c21`, email: `user${n}@example.test`, status: 'active', email_verified: true, is_admin: false, created_at: '2026-10-01T08:00:00Z', last_seen_at: '2026-11-03T08:00:00Z', runs_in_range: n, ...over });

/** Synthetic accounts. The first row is the signed-in admin (same id as fixtures/admin.ts), the second another admin. */
export const selfUser = make(900, { id: '99999999-0000-4000-8000-0000000000aa', email: adminEmail, is_admin: true });
export const otherAdmin = make(901, { email: 'ops2@example.test', is_admin: true });
export const ada = make(1, { email: 'ada@example.test', runs_in_range: 12 });
export const bo = make(2, { email: 'bo@example.test', status: 'suspended', email_verified: false, last_seen_at: null, runs_in_range: 0 });
export const cy = make(3, { email: 'cy@example.test', status: 'deleting' });
export const baseUsers = [selfUser, otherAdmin, ada, bo, cy];
/** `n` extra active accounts, newest first like the backend order, for paging specs. */
export const manyUsers = (n: number): User[] => Array.from({ length: n }, (_, i) => make(100 + i, { email: `member${String(i + 1).padStart(2, '0')}@example.test` }));

export type AdminUsersMock = { requests: URL[]; posts: { path: string; body: unknown }[]; users: User[]; failList: boolean };

/** Mocks only /v1/admin/users*. Search, status and offset paging (page, page_size; out of range answers the last page) behave like the backend. `failList` can be flipped mid-test (React StrictMode mounts twice, so a fail-once counter would be spent by the first mount). Counts are fixed: 3 projects, 2 CVs, 41 runs. */
export async function mockAdminUsers(page: Page, opts: { users?: User[]; failList?: boolean; actionError?: Record<string, string> } = {}): Promise<AdminUsersMock> {
  const mock: AdminUsersMock = { requests: [], posts: [], users: (opts.users ?? baseUsers).map(u => ({ ...u })), failList: opts.failList ?? false };
    const detail = (u: User) => ({ user: u, project_count: 3, cv_count: 2, run_count: 41 });
  await page.route(url => url.pathname.startsWith('/v1/admin/users'), async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/v1/admin/users', '');
    if (req.method() === 'GET' && path === '') {
      mock.requests.push(url);
      if (mock.failList) { await route.fulfill({ status: 503, json: { code: 'unavailable', message_key: 'service.unavailable', retryable: true } }); return; }
      const q = (url.searchParams.get('q') ?? '').toLowerCase(), status = url.searchParams.get('status'), size = Number(url.searchParams.get('page_size') ?? 10);
      const rows = mock.users.filter(u => u.email.includes(q) && (!status || u.status === status));
      const last = Math.max(0, Math.ceil(rows.length / size) - 1), at = Math.min(Number(url.searchParams.get('page') ?? 0), last);
      await route.fulfill({ json: { items: rows.slice(at * size, (at + 1) * size), total: rows.length, page: at, page_size: size } });
      return;
    }
    const [, userId, action] = path.split('/');
    const user = mock.users.find(u => u.id === userId);
    if (!user) { await route.fulfill({ status: 404, json: { code: 'not_found', message_key: 'errors.not_found' } }); return; }
    if (req.method() === 'GET') { await route.fulfill({ json: detail(user) }); return; }
    mock.posts.push({ path: `${action}`, body: req.postDataJSON() });
    const failing = opts.actionError?.[action];
    if (failing) { await route.fulfill({ status: failing === 'confirmation_mismatch' ? 422 : failing === 'account_deleting' ? 409 : 403, json: { code: failing, message_key: `errors.${failing}` } }); return; }
    if (action === 'suspend') user.status = 'suspended';
    if (action === 'enable') user.status = 'active';
    if (action === 'delete') user.status = 'deleting';
    await route.fulfill(action === 'suspend' || action === 'enable' ? { json: detail(user) } : { status: 204, body: '' });
  });
  return mock;
}
