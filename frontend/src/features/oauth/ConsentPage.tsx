import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../../components/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { ApiError } from '../../lib/api-types';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { sendJson, useResource } from '../projects/useResource';
import { Field, selectClass } from '../settings/Field';

type Capability = 'results:read' | 'jobs:evaluate' | 'documents:draft' | 'cv:tailor' | 'jobs:search' | 'applications:apply' | 'applications:write';
const capabilityKey: Record<Capability, string> = { 'results:read': 'capability.resultsRead', 'jobs:evaluate': 'capability.jobsEvaluate', 'documents:draft': 'capability.documentsDraft', 'cv:tailor': 'capability.cvTailor', 'jobs:search': 'capability.jobsSearch', 'applications:apply': 'capability.applicationsApply', 'applications:write': 'capability.applicationsWrite' };
type ConsentView = { client_name: string; client_id_host: string; redirect_uri: string; requested_scopes: string[]; projects: { id: string; name: string }[]; expires_at: string };

// Defense in depth: the server already validates redirect URIs; never navigate to script-capable schemes.
// Private-use app schemes (RFC 8252) and loopback/https redirects are allowed.
function navigableRedirect(value: string): string | null {
  try {
    const url = new URL(value);
    return ['javascript:', 'data:', 'vbscript:', 'blob:', 'file:', 'about:'].includes(url.protocol) ? null : url.href;
  } catch { return null; }
}

function hostOf(url: string) { try { return new URL(url).host; } catch { return url; } }

export function ConsentPage() {
  return <AppShell><ConsentBody /></AppShell>;
}

function ConsentBody() {
  const { t } = useTranslation();
  const { t: ts } = useTranslation('settings');
  const [params] = useSearchParams();
  const handle = params.get('request') ?? '';
  const path = `/oauth/requests/${encodeURIComponent(handle)}`;
  const view = useResource<ConsentView>(handle ? path : null);
  const [project, setProject] = useState('');
  const [chosen, setChosen] = useState<Capability[] | null>(null);
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'expired' | 'failed' | null>(null);

  if (!handle || view.errorStatus === 404 || error === 'expired') return <Card className="mx-auto mt-12 max-w-xl"><CardContent className="pt-6"><p>{t('oauth.expired')}</p></CardContent></Card>;
  if (view.status === 'error') return <ErrorState onRetry={view.reload} />;
  if (!view.data) return <LoadingState />;
  const data = view.data;
  // Write-capable scopes are never pre-checked; the owner must tick them deliberately.
  const capabilities = chosen ?? ((data.requested_scopes.length ? data.requested_scopes : ['results:read']).filter(s => s in capabilityKey && s !== 'applications:apply' && s !== 'applications:write') as Capability[]);
  const projectId = project || data.projects[0]?.id || '';

  async function submit(kind: 'approve' | 'deny') {
    setBusy(true); setError(null);
    try {
      const body = kind === 'approve' ? { project_id: projectId, capabilities, expires_at: new Date(Date.now() + Number(days) * 86_400_000).toISOString() } : {};
      const result = await sendJson<{ redirect_url: string }>(`${path}/${kind}`, 'POST', body);
      const target = navigableRedirect(result.redirect_url);
      if (!target) throw new Error('unsafe redirect');
      window.location.assign(target);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 404 ? 'expired' : 'failed');
      setBusy(false);
    }
  }
  const toggle = (c: Capability, on: boolean) => setChosen(on ? [...new Set([...capabilities, c])] : capabilities.filter(x => x !== c));

  return <Card className="mx-auto mt-12 max-w-xl">
    <CardHeader className="grid gap-2">
      <h1 className="text-xl font-semibold [overflow-wrap:anywhere]">{t('oauth.title', { client: data.client_name })}</h1>
      <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{t('oauth.origin', { host: data.client_id_host, redirect: hostOf(data.redirect_uri) })}</p>
    </CardHeader>
    {data.projects.length === 0 ? <CardContent><p>{t('oauth.noProjects')}</p><a className="underline" href="/app/projects/new">{t('oauth.createProject')}</a></CardContent> : <>
      <CardContent className="grid gap-4">
        <Field id="oauth-project" label={t('oauth.project')}>
          <select id="oauth-project" className={selectClass} value={projectId} onChange={e => setProject(e.target.value)}>
            {data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t('oauth.capabilities')}</legend>
          {(Object.keys(capabilityKey) as Capability[]).map(c => <label key={c} className="flex min-h-11 items-center gap-3 rounded-lg border p-3 text-sm">
            <input type="checkbox" className="size-5 accent-primary" checked={capabilities.includes(c)} onChange={e => toggle(c, e.target.checked)} />{ts(capabilityKey[c])}
          </label>)}
        </fieldset>
        <Field id="oauth-expiry" label={t('oauth.expiry')} className="sm:max-w-xs">
          <select id="oauth-expiry" className={selectClass} value={days} onChange={e => setDays(e.target.value)}>
            {['7', '30', '90'].map(d => <option key={d} value={d}>{t('oauth.days', { count: Number(d) })}</option>)}
          </select>
        </Field>
        {error === 'failed' && <p role="alert" className="text-sm text-destructive">{t('errors.request_failed')}</p>}
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button type="button" disabled={busy || capabilities.length === 0} onClick={() => void submit('approve')}>{t('oauth.allow')}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void submit('deny')}>{t('oauth.deny')}</Button>
      </CardFooter>
    </>}
  </Card>;
}
