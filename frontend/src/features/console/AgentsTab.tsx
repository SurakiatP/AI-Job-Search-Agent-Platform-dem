import { useState } from 'react';
import type { FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { sendJson, useResource } from '../projects/useResource';
import { apiRequest } from '@/lib/api';
import type { Copy } from './copy';
import { CopyButton, Empty, useNow, type Locale } from './shared';

type Capability = 'results:read' | 'jobs:evaluate' | 'documents:draft' | 'cv:tailor' | 'jobs:search' | 'applications:apply';
const CAPS: Capability[] = ['results:read', 'jobs:evaluate', 'documents:draft', 'cv:tailor', 'jobs:search', 'applications:apply'];
type Grant = { id: string; label?: string | null; project_id: string; capabilities: Capability[]; expires_at: string; revoked_at: string | null };
type Issued = Grant & { token: string };

export function AgentsTab({ projectId, locale, c }: { projectId: string; locale: Locale; c: Copy }) {
  const project = encodeURIComponent(projectId);
  const grants = useResource<Grant[]>(`/projects/${project}/grants`);
  const [caps, setCaps] = useState<Capability[]>(['results:read', 'jobs:evaluate']);
  const [name, setName] = useState('');
  const [hours, setHours] = useState('24');
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const now = useNow(30000);
  // token lives only in this component state; Tabs unmounts it on tab change

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || caps.length === 0) return;
    setBusy(true); setFailed(false);
    try {
      const expires_at = new Date(Date.now() + Number(hours) * 3600_000).toISOString();
      setIssued(await sendJson<Issued>(`/projects/${project}/grants`, 'POST', { capabilities: caps, expires_at, ...(name.trim() ? { label: name.trim() } : {}) }));
      grants.reload();
    } catch { setFailed(true); } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setFailed(false);
    try { await apiRequest<void>(`/projects/${project}/grants/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
    catch { setFailed(true); } finally { setBusy(false); grants.reload(); }
  }

  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const state = (g: Grant) => g.revoked_at ? 'revoked' : Date.parse(g.expires_at) <= now ? 'expired' : 'active';
  return <div className="grid gap-6">
    {failed && <p role="alert" className="text-sm text-destructive">{c.opaction}</p>}
    <Card>
      <CardHeader><CardTitle>{c.issue}</CardTitle><p className="text-sm text-muted-foreground">{c.issueIntro}</p></CardHeader>
      <CardContent>
        <form onSubmit={create} className="grid gap-4">
          <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-medium">{c.capabilities}</legend>
            {CAPS.map(cap => <label key={cap} className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={caps.includes(cap)} onChange={e => setCaps(cur => e.target.checked ? [...new Set([...cur, cap])] : cur.filter(x => x !== cap))} />
              {c.caps[cap]} <span className="text-xs text-muted-foreground">{cap}</span>
            </label>)}
            {caps.length === 0 && <p role="alert" className="text-xs text-destructive">{c.needCap}</p>}
          </fieldset>
          <div className="grid max-w-xs gap-1.5">
            <label htmlFor="console-grant-name" className="text-sm font-medium">{c.grantName}</label>
            <Input id="console-grant-name" value={name} maxLength={80} onChange={e => setName(e.target.value)} autoComplete="off" aria-describedby="console-grant-name-hint" />
            <p id="console-grant-name-hint" className="text-xs text-muted-foreground">{c.grantNameHint}</p>
          </div>
          <div className="grid max-w-xs gap-1.5">
            <label htmlFor="console-expiry" className="text-sm font-medium">{c.expiry}</label>
            <select id="console-expiry" value={hours} onChange={e => setHours(e.target.value)} className="min-h-10 rounded-md border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="1">{c.h1}</option><option value="24">{c.h24}</option><option value="168">{c.d7}</option>
            </select>
          </div>
          <div><Button type="submit" disabled={busy || caps.length === 0}>{c.create}</Button></div>
        </form>
      </CardContent>
    </Card>

    {issued && <Card role="region" aria-labelledby="issued-title" className="border-warning">
      <CardHeader><CardTitle id="issued-title">{c.shownOnce}</CardTitle><p role="alert" className="text-sm font-medium text-warning">{c.warning}</p></CardHeader>
      <CardContent className="grid gap-3">
        <label htmlFor="issued-token" className="text-sm font-medium">{c.token}</label>
        <Input id="issued-token" readOnly value={issued.token} onFocus={e => e.currentTarget.select()} autoComplete="off" spellCheck={false} className="font-mono text-sm" />
        <div className="flex flex-wrap items-center gap-3"><CopyButton text={issued.token} c={c} label={c.token} /><Button type="button" variant="outline" size="sm" onClick={() => setIssued(null)}>{c.dismiss}</Button></div>
      </CardContent>
    </Card>}

    <section aria-labelledby="grants-heading" className="grid gap-3">
      <h2 id="grants-heading" className="text-lg font-semibold">{c.grants}</h2>
      {grants.status === 'error' ? <ErrorState onRetry={grants.reload} /> : grants.status === 'loading' && !grants.data ? <LoadingState /> :
        (grants.data ?? []).length === 0 ? <Empty title={c.noGrants} next={c.noGrantsNext} /> :
        <ul className="divide-y rounded-xl border bg-card">{[...(grants.data ?? [])].sort((a, b) => Date.parse(b.expires_at) - Date.parse(a.expires_at)).map((g, index) => {
          const s = state(g);
          return <li key={g.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${s === 'active' ? '' : 'text-muted-foreground'}`}>
            <div className="grid min-w-0 gap-1.5">
              {g.label && <p className="break-words text-sm font-medium">{g.label}</p>}
              <div className="flex flex-wrap gap-1.5">{g.capabilities.map(cap => <Badge key={cap} variant="outline">{c.caps[cap]}</Badge>)}</div>
              <p className="text-sm">{c.expiresAt} <time dateTime={g.expires_at}>{fmt.format(new Date(g.expires_at))}</time> · <span className="text-xs">{c.id} #{index + 1}</span></p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={s === 'active' ? 'success' : 'secondary'}>{s === 'active' ? c.active : s === 'expired' ? c.expiredS : c.revoked}</Badge>
              {s === 'active' && <Button type="button" size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => void revoke(g.id)}>{c.revoke}</Button>}
            </div>
          </li>;
        })}</ul>}
    </section>
  </div>;
}
