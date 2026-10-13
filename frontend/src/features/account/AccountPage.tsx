import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { apiRequest, deleteAccount, logout, resendVerification, useAccount } from '../../lib/api';
import { ApiError, type AccountAgent } from '../../lib/api-types';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { useResource } from '../projects/useResource';

function EmailSection() {
  const { t } = useTranslation();
  const account = useAccount();
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');
  if (!account) return null;
  async function resend() {
    setState('busy');
    try { await resendVerification(); setState('sent'); } catch { setState('failed'); }
  }
  return <Card>
    <CardHeader><CardTitle className="text-lg">{t('account.emailSection')}</CardTitle></CardHeader>
    <CardContent className="flex flex-wrap items-center gap-3">
      <p className="min-w-0 text-sm [overflow-wrap:anywhere]">{account.email}</p>
      <Badge variant={account.email_verified ? 'success' : 'secondary'}>{account.email_verified ? t('account.verifiedStatus') : t('account.unverifiedStatus')}</Badge>
      {!account.email_verified && <Button type="button" size="sm" variant="outline" disabled={state === 'busy' || state === 'sent'} onClick={() => void resend()}>{t('account.resend')}</Button>}
      <span role="status" className="text-sm text-muted-foreground">{state === 'sent' ? t('account.resent') : ''}</span>
      {state === 'failed' && <span role="alert" className="text-sm text-destructive">{t('errors.request_failed')}</span>}
    </CardContent>
  </Card>;
}

function AgentsSection() {
  const { t, i18n } = useTranslation();
  const agents = useResource<AccountAgent[]>('/account/agents');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function revoke(agent: AccountAgent) {
    setBusy(true); setFailed(false);
    try { await apiRequest<void>(`/projects/${encodeURIComponent(agent.project_id)}/grants/${encodeURIComponent(agent.id)}`, { method: 'DELETE' }); }
    catch (caught) { if (!(caught instanceof ApiError && caught.status === 404)) setFailed(true); }
    finally { setBusy(false); agents.reload(); }
  }
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const stateOf = (a: AccountAgent) => a.revoked_at ? 'revoked' : Date.parse(a.expires_at) <= Date.now() ? 'expired' : 'active';
  return <section aria-labelledby="account-agents" className="grid gap-3">
    <div className="grid gap-1"><h2 id="account-agents" className="text-lg font-semibold">{t('account.agentsSection')}</h2><p className="text-sm text-muted-foreground">{t('account.agentsIntro')}</p></div>
    {failed && <p role="alert" className="text-sm text-destructive">{t('account.revokeFailed')}</p>}
    {agents.status === 'error' ? <ErrorState onRetry={agents.reload} />
      : agents.status === 'loading' && !agents.data ? <LoadingState />
      : (agents.data ?? []).length === 0 ? <div className="grid gap-1 rounded-xl border border-dashed bg-card p-6"><p className="font-medium">{t('account.noAgents')}</p><p className="text-sm text-muted-foreground">{t('account.noAgentsNext')}</p></div>
      : <ul className="divide-y rounded-xl border bg-card">{(agents.data ?? []).map(agent => {
        const state = stateOf(agent);
        return <li key={agent.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${state === 'active' ? '' : 'text-muted-foreground'}`}>
          <div className="grid min-w-0 gap-1.5">
            <p className="break-words text-sm font-medium">{agent.label ?? t('account.untitledAgent')}</p>
            <p className="break-words text-sm">{t('account.project')}: {agent.project_name}</p>
            <div className="flex flex-wrap gap-1.5">{agent.capabilities.map(cap => <Badge key={cap} variant="outline">{cap}</Badge>)}</div>
            <p className="text-sm">{t('account.expires')} <time dateTime={agent.expires_at}>{fmt.format(new Date(agent.expires_at))}</time></p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={state === 'active' ? 'success' : 'secondary'}>{t(`account.${state}`)}</Badge>
            {state === 'active' && <Button type="button" size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => void revoke(agent)}>{t('account.revoke')}</Button>}
          </div>
        </li>;
      })}</ul>}
  </section>;
}

function DeleteDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      await deleteAccount(password, confirm.trim());
      navigate('/', { replace: true });
    } catch (caught) {
      const key = caught instanceof ApiError ? `errors.${caught.code}` : '';
      setError(key && ['errors.invalid_credentials', 'errors.confirmation_mismatch', 'errors.rate_limited'].includes(key) ? t(key, { seconds: caught instanceof ApiError ? caught.fields?.retry_after ?? '60' : '60' }) : t('errors.request_failed'));
      setBusy(false);
    }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent>
      <form className="grid gap-4" onSubmit={event => void submit(event)}>
        <DialogTitle>{t('account.deleteTitle')}</DialogTitle>
        <DialogDescription>{t('account.deleteBody')}</DialogDescription>
        <div className="grid gap-1.5"><Label htmlFor="delete-password">{t('auth.password')}</Label><Input id="delete-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
        <div className="grid gap-1.5"><Label htmlFor="delete-email">{t('account.confirmEmail')}</Label><Input id="delete-email" type="email" autoComplete="off" placeholder={email} required value={confirm} onChange={e => setConfirm(e.target.value)} /></div>
        {error && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>{t('account.cancel')}</Button></DialogClose>
          <Button type="submit" variant="destructive" disabled={busy || !password || !confirm}>{t('account.deleteConfirm')}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function AccountPage() {
  const { t } = useTranslation();
  const account = useAccount();
  const [deleting, setDeleting] = useState(false);
  if (!account) return <LoadingState />;
  return <div className="mx-auto grid max-w-3xl gap-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1"><h1 className="text-2xl font-semibold leading-snug">{t('account.title')}</h1><p className="text-sm text-muted-foreground">{t('account.description')}</p></div>
      <Button type="button" variant="outline" onClick={() => void logout()}>{t('auth.logout')}</Button>
    </div>
    <EmailSection />
    <AgentsSection />
    <Card className="border-destructive/50">
      <CardHeader><CardTitle className="text-lg">{t('account.dangerSection')}</CardTitle><CardDescription>{t('account.dangerBody')}</CardDescription></CardHeader>
      <CardContent><Button type="button" variant="destructive" onClick={() => setDeleting(true)}>{t('account.deleteAction')}</Button></CardContent>
    </Card>
    {deleting && <DeleteDialog email={account.email} onClose={() => setDeleting(false)} />}
  </div>;
}
