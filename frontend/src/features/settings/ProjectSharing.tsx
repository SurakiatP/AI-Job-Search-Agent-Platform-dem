import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { apiRequest } from '../../lib/api';
import { useResource } from '../projects/useResource';

type Capability = 'results:read' | 'jobs:evaluate' | 'documents:draft';
type Grant = { id: string; project_id: string; capabilities: Capability[]; expires_at: string; revoked_at: string | null };
type IssuedGrant = Grant & { token: string };

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

  return <div className="settings-form">
    <p>{t('sharing.description')}</p>
    <p>{t('sharingDefaultOff')}</p>
    <form onSubmit={create}>
      <fieldset><legend>{t('capabilities')}</legend>
        {(['results:read', 'jobs:evaluate', 'documents:draft'] as const).map((capability, index) => <label className="check-row" key={capability}><input type="checkbox" checked={capabilities.includes(capability)} onChange={event => toggle(capability, event.target.checked)} />{t(['capability.resultsRead', 'capability.jobsEvaluate', 'capability.documentsDraft'][index])}</label>)}
      </fieldset>
      <label htmlFor="grant-expiry">{t('expiresAfter')}</label>
      <select id="grant-expiry" value={expiryHours} onChange={event => setExpiryHours(event.target.value)}><option value="1">{t('hours', { count: 1 })}</option><option value="6">{t('hours', { count: 6 })}</option><option value="24">{t('hours', { count: 24 })}</option></select>
      <Button variant="primary" type="submit" disabled={busy || capabilities.length === 0}>{t('createGrant')}</Button>
    </form>
    {issued && <section role="dialog" aria-modal="true" aria-labelledby="issued-grant-title" className="surface-card">
      <h3 id="issued-grant-title">{t('tokenShownOnce')}</h3>
      <p>{t('tokenWarning')}</p>
      <label htmlFor="issued-token">{t('accessToken')}</label>
      <textarea id="issued-token" readOnly rows={3} value={issued.token} />
      <Button onClick={() => void copyToken()}>{t('copyToken')}</Button>
      {copied && <p role="status">{t('copied')}</p>}
      <Button variant="primary" onClick={dismiss}>{t('dismissToken')}</Button>
    </section>}
    {error && <p role="alert">{t('saveFailed')}</p>}
    {grants.status === 'loading' && <p role="status">{t('loading')}</p>}
    {grants.status === 'error' && <p role="alert">{t('loadError')}</p>}
    {grants.data && <section><h3>{t('activeGrants')}</h3><ul className="revision-list">{grants.data.map(grant => <li key={grant.id}>
      <strong>{t('projectLabel', { projectId: grant.project_id })}</strong>
      <span>{grant.capabilities.map(capability => t(capability === 'results:read' ? 'capability.resultsRead' : capability === 'jobs:evaluate' ? 'capability.jobsEvaluate' : 'capability.documentsDraft')).join(', ')}</span>
      <span>{grant.revoked_at ? t('revoked') : new Date(grant.expires_at).getTime() <= Date.now() ? t('expired') : t('expires', { date: new Date(grant.expires_at).toLocaleString(i18n.language) })}</span>
      {!grant.revoked_at && new Date(grant.expires_at).getTime() > Date.now() && <Button disabled={busy} onClick={() => void revoke(grant.id)}>{t('revoke')}</Button>}
    </li>)}</ul></section>}
  </div>;
}
