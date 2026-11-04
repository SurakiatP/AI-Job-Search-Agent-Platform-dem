import { useEffect, useState, type ReactNode } from 'react';
import { KeyRound, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { admin, useAccount } from '../../../lib/api';
import { ApiError, type AdminUserDetail, type AdminUserItem } from '../../../lib/api-types';
import { Sheet, TypedConfirm } from '../ui';
import { StatusBadge, useDates } from './shared';

type Action = 'suspend' | 'enable' | 'reset' | 'delete';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-0.5"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="text-sm tabular-nums [overflow-wrap:anywhere]">{children}</dd></div>;
}

function ActionRow({ hint, children }: { hint: string; children: ReactNode }) {
  return <div className="grid gap-2 rounded-xl border p-4"><p className="text-sm text-muted-foreground">{hint}</p><div className="flex flex-wrap gap-2">{children}</div></div>;
}

export function UserSheet({ user, onClose, onChanged }: { user: AdminUserItem | null; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation('admin-users');
  const d = useDates();
  const me = useAccount();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [matched, setMatched] = useState(false);

  useEffect(() => {
    setDetail(null); setLoadFailed(false); setMessage(''); setError(''); setConfirming(false); setMatched(false);
    if (!user) return;
    const live = { on: true };
    admin.user(user.id).then(v => { if (live.on) setDetail(v); }).catch(() => { if (live.on) setLoadFailed(true); });
    return () => { live.on = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = detail?.user ?? user;
  async function run(action: Action, call: () => Promise<AdminUserDetail | void>) {
    if (!shown || busy) return;
    setBusy(action); setMessage(''); setError('');
    try {
      const result = await call();
      setMessage(t(`done.${action}`, { email: shown.email }));
      setConfirming(false); setMatched(false);
      setDetail(result ?? await admin.user(shown.id));
      onChanged();
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : '';
      setError(t(['admin_target_forbidden', 'confirmation_mismatch', 'account_deleting'].includes(code) ? `error.${code}` : 'error.generic'));
    } finally { setBusy(null); }
  }

  const locked = !shown ? '' : shown.id === me?.id ? 'self' : shown.is_admin ? 'admin' : shown.status === 'deleting' ? 'deleting' : '';
  const suspended = shown?.status === 'suspended';
  return <Sheet open={!!user} onOpenChange={open => { if (!open && !busy) onClose(); }} closeLabel={t('sheet.close')}
    title={shown?.email ?? ''}
    subtitle={shown ? <span className="flex flex-wrap items-center gap-2"><StatusBadge status={shown.status} />{shown.is_admin ? <Badge variant="default">{t('adminBadge')}</Badge> : null}</span> : null}>
    {shown ? <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Fact label={t('sheet.created')}>{d.full(shown.created_at)}</Fact>
        <Fact label={t('sheet.lastSeen')}>{shown.last_seen_at ? d.full(shown.last_seen_at) : t('never')}</Fact>
        <Fact label={t('sheet.verified')}>{shown.email_verified ? t('verified') : t('unverified')}</Fact>
        <Fact label={t('sheet.runs')}>{detail ? detail.run_count.toLocaleString() : '–'}</Fact>
        <Fact label={t('sheet.projects')}>{detail ? detail.project_count.toLocaleString() : '–'}</Fact>
        <Fact label={t('sheet.cvs')}>{detail ? detail.cv_count.toLocaleString() : '–'}</Fact>
      </dl>
      <p className="text-xs text-muted-foreground">{loadFailed ? t('sheet.detailFailed') : t('sheet.countsNote')}</p>
      <div role="status" className="grid gap-2 empty:hidden">
        {message ? <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success [overflow-wrap:anywhere]">{message}</p> : null}
      </div>
      {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {locked ? <p className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">{t(`locked.${locked}`)}</p> : <div className="grid gap-3">
        <ActionRow hint={t(suspended ? 'action.enableHint' : 'action.suspendHint')}>
          {suspended
            ? <Button variant="outline" busy={busy === 'enable'} disabled={!!busy} onClick={() => run('enable', () => admin.enableUser(shown.id))}><ShieldCheck className="size-4" aria-hidden="true" />{t('action.enable')}</Button>
            : <Button variant="outline" busy={busy === 'suspend'} disabled={!!busy} onClick={() => run('suspend', () => admin.suspendUser(shown.id))}><ShieldOff className="size-4" aria-hidden="true" />{t('action.suspend')}</Button>}
        </ActionRow>
        <ActionRow hint={t('action.resetHint')}>
          <Button variant="outline" busy={busy === 'reset'} disabled={!!busy} onClick={() => run('reset', () => admin.resetUserPassword(shown.id))}><KeyRound className="size-4" aria-hidden="true" />{t('action.reset')}</Button>
        </ActionRow>
        <ActionRow hint={t('action.deleteHint')}>
          {confirming ? <div className="grid w-full gap-3">
            <TypedConfirm phrase={shown.email} label={t('action.typeEmail')} matchedLabel={t('action.matched')} ignoreCase onMatchChange={setMatched} />
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" busy={busy === 'delete'} disabled={!matched || !!busy} onClick={() => run('delete', () => admin.deleteUser(shown.id, shown.email))}>{t('action.confirmDelete')}</Button>
              <Button variant="ghost" disabled={!!busy} onClick={() => { setConfirming(false); setMatched(false); setError(''); }}>{t('action.cancel')}</Button>
            </div>
          </div> : <Button variant="outline" className="text-destructive" disabled={!!busy} onClick={() => { setConfirming(true); setMessage(''); setError(''); }}><Trash2 className="size-4" aria-hidden="true" />{t('action.delete')}</Button>}
        </ActionRow>
      </div>}
    </> : null}
  </Sheet>;
}
