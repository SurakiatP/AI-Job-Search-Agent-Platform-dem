import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '../../lib/api';
import { useResource } from '../projects/useResource';
import { Field, LoadingBlock, Notice, SectionCard, selectClass } from './Field';

type Capability = 'results:read' | 'jobs:evaluate' | 'documents:draft';
type Grant = { id: string; project_id: string; capabilities: Capability[]; expires_at: string; revoked_at: string | null };
type IssuedGrant = Grant & { token: string };
const capabilityKey: Record<Capability, string> = { 'results:read': 'capability.resultsRead', 'jobs:evaluate': 'capability.jobsEvaluate', 'documents:draft': 'capability.documentsDraft' };

export function ProjectSharing({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation('settings');
  const project = encodeURIComponent(projectId);
  const grants = useResource<Grant[]>(`/projects/${project}/grants`);
  const [capabilities, setCapabilities] = useState<Capability[]>(['results:read']);
  const [expiryHours, setExpiryHours] = useState('24');
  const [issued, setIssued] = useState<IssuedGrant | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  function toggle(capability: Capability, enabled: boolean) {
    setCapabilities(current => enabled ? [...new Set([...current, capability])] : current.filter(item => item !== capability));
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !capabilities.length) return;
    setBusy(true); setError(false); setCopied(false);
    try {
      const expiresAt = new Date(Date.now() + Number(expiryHours) * 60 * 60 * 1000).toISOString();
      const value = await apiRequest<IssuedGrant>(`/projects/${project}/grants`, { method: 'POST', body: JSON.stringify({ capabilities, expires_at: expiresAt }) });
      setIssued(value); grants.reload();
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setError(false);
    try { await apiRequest<void>(`/projects/${project}/grants/${encodeURIComponent(id)}`, { method: 'DELETE' }); grants.reload(); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  async function copyToken() {
    if (!issued) return;
    try { await navigator.clipboard.writeText(issued.token); setCopied(true); }
    catch { setCopied(false); }
  }
  function dismiss() { setIssued(null); setCopied(false); }
  const active = (grant: Grant) => !grant.revoked_at && new Date(grant.expires_at).getTime() > Date.now();

  return <div className="grid gap-6">
    <SectionCard title={t('nav.sharing')} description={t('sharing.description')} onSubmit={create}
      footer={<Button type="submit" disabled={busy || capabilities.length === 0}>{t('createGrant')}</Button>}>
      <p className="text-sm text-muted-foreground">{t('sharingDefaultOff')} {t('sharingResultsPrivacy')}</p>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t('capabilities')}</legend>
        {(Object.keys(capabilityKey) as Capability[]).map(capability => <label className="flex min-h-11 items-center gap-3 rounded-lg border p-3 text-sm" key={capability}>
          <input type="checkbox" className="size-5 accent-primary" checked={capabilities.includes(capability)} onChange={event => toggle(capability, event.target.checked)} />{t(capabilityKey[capability])}
        </label>)}
      </fieldset>
      <Field id="grant-expiry" label={t('expiresAfter')} className="sm:max-w-xs">
        <select id="grant-expiry" className={selectClass} value={expiryHours} onChange={event => setExpiryHours(event.target.value)}>
          {[1, 6, 24].map(hours => <option key={hours} value={hours}>{t('hours', { count: hours })}</option>)}
        </select>
      </Field>
      {error && <Notice>{t('saveFailed')}</Notice>}
    </SectionCard>

    {issued && <section role="dialog" aria-modal="true" aria-labelledby="issued-grant-title" className="grid gap-3 rounded-xl border border-primary bg-card p-6 shadow-sm">
      <h3 id="issued-grant-title" className="font-semibold">{t('tokenShownOnce')}</h3>
      <p className="text-sm text-muted-foreground">{t('tokenWarning')}</p>
      <Field id="issued-token" label={t('accessToken')}><Textarea id="issued-token" readOnly rows={3} value={issued.token} className="font-mono text-sm" /></Field>
      {copied && <Notice ok>{t('copied')}</Notice>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => void copyToken()}>{t('copyToken')}</Button>
        <Button onClick={dismiss}>{t('dismissToken')}</Button>
      </div>
    </section>}

    <Card>
      <CardHeader><CardTitle role="heading" aria-level={2}>{t('activeGrants')}</CardTitle><CardDescription>{t('activeGrantsHint')}</CardDescription></CardHeader>
      <CardContent className={grants.data ? 'pb-6' : ''}>
        {grants.status === 'loading' && <LoadingBlock label={t('loading')} />}
        {grants.status === 'error' && <Notice>{t('loadError')}</Notice>}
        {grants.data?.length === 0 && <p className="text-sm text-muted-foreground">{t('noGrants')}</p>}
        {grants.data && grants.data.length > 0 && <ul className="divide-y">{grants.data.map(grant => <li key={grant.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium">{grant.capabilities.map(capability => t(capabilityKey[capability])).join(', ')}</p>
            <p className="text-sm text-muted-foreground">{grant.revoked_at ? t('revoked') : active(grant) ? t('expires', { date: new Date(grant.expires_at).toLocaleString(i18n.language) }) : t('expired')}</p>
          </div>
          {active(grant) && <Button variant="outline" size="sm" disabled={busy} onClick={() => void revoke(grant.id)}>{t('revoke')}</Button>}
        </li>)}</ul>}
      </CardContent>
      {grants.status === 'error' && <CardFooter className="justify-end gap-2"><Button variant="outline" onClick={grants.reload}>{t('retry')}</Button></CardFooter>}
    </Card>
  </div>;
}
