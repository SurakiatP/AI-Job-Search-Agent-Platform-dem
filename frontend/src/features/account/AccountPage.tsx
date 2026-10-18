import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog';
import { PasswordInput } from '../../components/PasswordInput';
import { Label } from '../../components/ui/label';
import { apiRequest, deleteAccount, logout, resendVerification, sendDeletionCode, useAccount } from '../../lib/api';
import { CodeInput } from '../../components/CodeInput';
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
  const { t: tu } = useTranslation('utilitiesWorkspace');
  const agents = useResource<AccountAgent[]>('/account/agents');
  const [revoking, setRevoking] = useState<AccountAgent | null>(null);
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const stateOf = (a: AccountAgent) => a.revoked_at ? 'revoked' : Date.parse(a.expires_at) <= Date.now() ? 'expired' : 'active';
  const all = agents.data ?? [];
  const active = all.filter(a => stateOf(a) === 'active');
  const inactive = all.filter(a => stateOf(a) !== 'active');
  const appName = (a: AccountAgent) => a.label ?? t('account.untitledAgent');
  const item = (agent: AccountAgent) => {
    const state = stateOf(agent);
    return <li key={agent.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${state === 'active' ? '' : 'text-muted-foreground'}`}>
      <div className="grid min-w-0 gap-1.5">
        <p className="break-words text-sm font-medium">{appName(agent)}</p>
        {agent.client_id_host && <p className="break-words text-sm text-muted-foreground">{t('account.oauthClient', { host: agent.client_id_host })}</p>}
        <p className="break-words text-sm">{t('account.project')}: {agent.project_name}</p>
        <div className="flex flex-wrap gap-1.5">{agent.capabilities.map(cap => <Badge key={cap} variant="outline">{cap}</Badge>)}</div>
        <p className="text-sm">{t('account.created')} <time dateTime={agent.created_at}>{fmt.format(new Date(agent.created_at))}</time> · {t('account.expires')} <time dateTime={agent.expires_at}>{fmt.format(new Date(agent.expires_at))}</time></p>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={state === 'active' ? 'success' : 'secondary'}>{t(`account.${state}`)}</Badge>
        {state === 'active' && <Button type="button" size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setRevoking(agent)}>{t('account.revoke')}</Button>}
      </div>
    </li>;
  };
  return <section aria-labelledby="account-agents" className="grid gap-3">
    <div className="grid gap-1"><h2 id="account-agents" className="text-lg font-semibold">{t('account.agentsSection')}</h2><p className="text-sm text-muted-foreground">{t('account.agentsIntro')}</p></div>
    {agents.status === 'error' ? <ErrorState onRetry={agents.reload} />
      : agents.status === 'loading' && !agents.data ? <LoadingState />
      : all.length === 0 ? <div className="grid gap-1 rounded-xl border border-dashed bg-card p-6"><p className="font-medium">{t('account.noAgents')}</p><p className="text-sm text-muted-foreground">{t('account.noAgentsNext')}</p></div>
      : <>
        {active.length > 0 ? <ul className="divide-y rounded-xl border bg-card">{active.map(item)}</ul> : <p className="text-sm text-muted-foreground">{tu('account.noActive')}</p>}
        {inactive.length > 0 && <details className="group">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{tu('account.expiredToggle', { count: inactive.length })}</summary>
          <ul className="mt-2 divide-y rounded-xl border bg-card">{inactive.map(item)}</ul>
        </details>}
      </>}
    {revoking && <ConfirmDeleteDialog
      title={tu('account.revokeTitle', { app: appName(revoking), project: revoking.project_name })}
      description={tu('account.revokeBody', { app: appName(revoking), project: revoking.project_name })}
      confirmLabel={tu('account.revokeConfirm')}
      onConfirm={() => apiRequest<void>(`/projects/${encodeURIComponent(revoking.project_id)}/grants/${encodeURIComponent(revoking.id)}`, { method: 'DELETE' })}
      onDone={() => { setRevoking(null); agents.reload(); }}
      onClose={() => setRevoking(null)} />}
  </section>;
}

function DeleteDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const thai = useTranslation().i18n.language.startsWith('th');
  const otp = thai
    ? { label: 'รหัส 6 หลักจากอีเมล', send: 'ส่งรหัสไปที่อีเมลของฉัน', resend: 'ส่งรหัสอีกครั้ง', sent: `ส่งรหัสไปที่ ${email} แล้ว รหัสหมดอายุใน 10 นาที`, first: 'ต้องขอรหัสทางอีเมลก่อน เพื่อยืนยันว่าเป็นคุณจริง' }
    : { label: '6-digit code from the email', send: 'Email me a code', resend: 'Send a new code', sent: `We sent a code to ${email}. It expires in 10 minutes.`, first: 'Request an emailed code first, to confirm it is really you.' };
  async function requestCode() {
    setCodeState('sending'); setError('');
    try { await sendDeletionCode(); setCodeState('sent'); setCode(''); }
    catch (caught) { setCodeState('idle'); setError(caught instanceof ApiError && caught.code === 'rate_limited' ? t('errors.rate_limited', { seconds: caught.fields?.retry_after ?? '60' }) : t('errors.request_failed')); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true); setError('');
    try {
      await deleteAccount(password, confirm.trim(), code);
      // Full reload: the session is gone, and a soft navigation races the login gate's redirect.
      window.location.replace('/');
    } catch (caught) {
      const key = caught instanceof ApiError ? `errors.${caught.code}` : '';
      setError(key && ['errors.invalid_credentials', 'errors.confirmation_mismatch', 'errors.rate_limited', 'errors.invalid_code'].includes(key) ? t(key, { seconds: caught instanceof ApiError ? caught.fields?.retry_after ?? '60' : '60' }) : t('errors.request_failed'));
      setBusy(false);
    }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent>
      <form className="grid gap-4" onSubmit={event => void submit(event)}>
        <DialogTitle>{t('account.deleteTitle')}</DialogTitle>
        <DialogDescription>{t('account.deleteBody')}</DialogDescription>
        <div className="grid gap-1.5"><Label htmlFor="delete-password">{t('auth.password')}</Label><PasswordInput id="delete-password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
        <div className="grid gap-1.5"><Label htmlFor="delete-email">{t('account.confirmEmail')}</Label><Input id="delete-email" type="email" autoComplete="off" placeholder={email} required value={confirm} onChange={e => setConfirm(e.target.value)} /></div>
        <div className="grid gap-2 rounded-lg border p-3">
          {codeState !== 'sent' ? <p className="text-sm text-muted-foreground">{otp.first}</p> : <>
            <Label htmlFor="delete-code">{otp.label}</Label>
            <CodeInput id="delete-code" required value={code} onChange={setCode} />
            <p role="status" className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{otp.sent}</p>
          </>}
          <Button type="button" variant="outline" className="justify-self-start" busy={codeState === 'sending'} disabled={busy || codeState === 'sending'} onClick={() => void requestCode()}>{codeState === 'sent' ? otp.resend : otp.send}</Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>{t('account.cancel')}</Button></DialogClose>
          <Button type="submit" variant="destructive" busy={busy} disabled={busy || !password || code.length !== 6 || confirm.trim().toLowerCase() !== email.trim().toLowerCase()}>{t('account.deleteConfirm')}</Button>
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
