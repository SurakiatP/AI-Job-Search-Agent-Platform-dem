import { useState, type FormEvent } from 'react';
import { UserCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { PageHeader } from '../../components/PageHeader';
import { PasswordInput } from '../../components/PasswordInput';
import { changePassword, useAccount } from '../../lib/api';
import { ApiError } from '../../lib/api-types';
import { dateLocale } from '../../lib/locale';
import { rateLimitText } from '../../lib/rateLimit';

const field = (id: string, label: string, value: string, set: (v: string) => void, autoComplete: string, invalid: boolean, hint?: string) =>
  <div className="grid gap-1.5">
    <div className="mui-field"><PasswordInput placeholder=" " id={id} autoComplete={autoComplete} required maxLength={128} value={value} aria-invalid={invalid || undefined} aria-describedby={hint ? `${id}-hint` : undefined} onChange={e => set(e.target.value)} /><Label htmlFor={id} className="mui-label">{label}</Label></div>
    {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
  </div>;

function PasswordCard() {
  const { t } = useTranslation('admin-shell');
  const common = useTranslation().t;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: 'current' | 'new' | 'confirm'; text: string } | null>(null);
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setDone(false);
    if (next.length < 10 || next.length > 128) { setError({ field: 'new', text: common('errors.weak_password') }); return; }
    if (next !== confirm) { setError({ field: 'confirm', text: t('accountPage.password.mismatch') }); return; }
    if (next === current) { setError({ field: 'new', text: t('accountPage.password.same') }); return; }
    setBusy(true); setError(null);
    try {
      await changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm(''); setDone(true);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : '';
      setError(code === 'invalid_credentials' ? { field: 'current', text: t('accountPage.password.wrongCurrent') }
        : code === 'weak_password' ? { field: 'new', text: common('errors.weak_password') }
        : { field: 'current', text: code === 'rate_limited' && caught instanceof ApiError ? rateLimitText(common, caught.fields?.retry_after) : common('errors.request_failed') });
    } finally { setBusy(false); }
  }
  return <Card>
    <CardHeader><CardTitle className="text-lg">{t('accountPage.password.title')}</CardTitle><CardDescription>{t('accountPage.password.hint')}</CardDescription></CardHeader>
    <CardContent>
      <form className="grid max-w-md gap-4" onSubmit={event => void submit(event)} noValidate>
        {field('admin-current-password', t('accountPage.password.current'), current, setCurrent, 'current-password', error?.field === 'current')}
        {field('admin-new-password', t('accountPage.password.new'), next, setNext, 'new-password', error?.field === 'new', t('accountPage.password.rule'))}
        {field('admin-confirm-password', t('accountPage.password.confirm'), confirm, setConfirm, 'new-password', error?.field === 'confirm')}
        {error && <Alert severity="error">{error.text}</Alert>}
        {done && <Alert severity="success">{t('accountPage.password.saved')}</Alert>}
        <Button type="submit" className="justify-self-start" busy={busy} disabled={busy || !current || !next || !confirm}>{t('accountPage.password.save')}</Button>
      </form>
    </CardContent>
  </Card>;
}

// Admins are created and removed in GitLab and may not receive mail, so there is a change form here but no reset link and no delete card.
export function AccountPage() {
  const { t, i18n } = useTranslation('admin-shell');
  const account = useAccount();
  if (!account) return null;
  const since = new Intl.DateTimeFormat(dateLocale(i18n.language), { dateStyle: 'long' }).format(new Date(account.created_at));
  return <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6">
    <PageHeader icon={UserCog} title={t('accountPage.title')} lede={t('accountPage.lede')} />
    <Card>
      <CardHeader><CardTitle className="text-lg">{t('accountPage.basics')}</CardTitle></CardHeader>
      <CardContent><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t('accountPage.emailLabel')}</dt><dd className="[overflow-wrap:anywhere]">{account.email}</dd>
        <dt className="text-muted-foreground">{t('accountPage.role')}</dt><dd>{t('role')}</dd>
        <dt className="text-muted-foreground">{t('accountPage.since')}</dt><dd><time dateTime={account.created_at}>{since}</time></dd>
      </dl></CardContent>
    </Card>
    <PasswordCard />
  </div>;
}
