import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useLocale } from '../../app/providers';
import { Header } from '../../components/Header';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { PasswordInput } from '../../components/PasswordInput';
import { Label } from '../../components/ui/label';
import { forgotPassword, login, refreshOwnerSession, resetPassword, signup, useOwnerSession, verifyEmail } from '../../lib/api';
import { ApiError } from '../../lib/api-types';

const linkClass = 'rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function AuthShell({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return <>
    <Header />
    <main id="main-content" tabIndex={-1} className="mx-auto grid w-full max-w-md px-4 py-12 sm:py-16">
      <Card>
        <CardHeader><h1 className="text-xl font-semibold leading-snug">{title}</h1>{intro && <CardDescription>{intro}</CardDescription>}</CardHeader>
        <CardContent className="grid gap-4">{children}</CardContent>
      </Card>
    </main>
  </>;
}

function Field({ id, label, hint, ...props }: { id: string; label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  return <div className="grid gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    {props.type === 'password'
      ? <PasswordInput id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      : <Input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />}
    {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
  </div>;
}

function useErrorText() {
  const { t, i18n } = useTranslation();
  return (error: unknown): string => {
    if (!(error instanceof ApiError)) return t('errors.request_failed');
    if (error.code === 'rate_limited') return t('errors.rate_limited', { seconds: error.fields?.retry_after ?? '60' });
    const key = `errors.${error.code}`;
    return i18n.exists(key) ? t(key) : t('errors.request_failed');
  };
}

function Alert({ children }: { children: ReactNode }) {
  return children ? <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{children}</p> : null;
}

// Only same-app paths may be targets, so a crafted ?next= cannot send people to another site.
function safeNext(value: string | null): string {
  return value && /^\/app(\/|\?|$)/.test(value) ? value : '/app';
}

function useSubmit(action: () => Promise<void>) {
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (caught) { setError(errorText(caught)); } finally { setBusy(false); }
  }
  return { busy, error, setError, submit };
}

// One-use tokens come from the emailed link; read once and drop them from the address bar and history.
function useUrlToken(): string | null {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'));
  useEffect(() => { if (token) window.history.replaceState(window.history.state, '', window.location.pathname); }, [token]);
  return token;
}

export function LoginPage() {
  const { t } = useTranslation();
  const session = useOwnerSession();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, submit } = useSubmit(() => login(email.trim(), password));
  if (session.status === 'ready') return <Navigate to={next} replace />;
  return <AuthShell title={t('auth.loginTitle')} intro={t('auth.loginIntro')}>
    <form className="grid gap-4" onSubmit={event => void submit(event)} noValidate>
      <Field id="login-email" label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <Field id="login-password" label={t('auth.password')} type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
      <Alert>{error}</Alert>
      <Button type="submit" disabled={busy || !email || !password}>{busy ? t('auth.working') : t('auth.loginAction')}</Button>
    </form>
    <p className="text-sm"><Link className={linkClass} to="/forgot-password">{t('auth.forgotLink')}</Link></p>
    <p className="text-sm text-muted-foreground">{t('auth.noAccount')} <Link className={linkClass} to="/signup">{t('auth.toSignup')}</Link></p>
  </AuthShell>;
}

export function SignupPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, submit } = useSubmit(async () => { await signup(email.trim(), password, locale); setSent(true); });
  if (sent) return <AuthShell title={t('auth.checkEmailTitle')} intro={t('auth.checkEmailBody')}>
    <Button asChild variant="outline"><Link to="/login">{t('auth.toLogin')}</Link></Button>
  </AuthShell>;
  return <AuthShell title={t('auth.signupTitle')} intro={t('auth.signupIntro')}>
    <form className="grid gap-4" onSubmit={event => void submit(event)} noValidate>
      <Field id="signup-email" label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <Field id="signup-password" label={t('auth.password')} hint={t('auth.passwordHint')} type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} />
      <Alert>{error}</Alert>
      <Button type="submit" disabled={busy || !email || password.length < 10}>{busy ? t('auth.working') : t('auth.signupAction')}</Button>
    </form>
    <p className="text-sm text-muted-foreground">{t('auth.haveAccount')} <Link className={linkClass} to="/login">{t('auth.toLogin')}</Link></p>
  </AuthShell>;
}

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useUrlToken();
  const errorText = useErrorText();
  const started = useRef(false);
  const [state, setState] = useState<{ status: 'working' } | { status: 'done' } | { status: 'failed'; message: string }>({ status: 'working' });
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) { setState({ status: 'failed', message: t('auth.verifyFailed') }); return; }
    verifyEmail(token)
      .then(() => { void refreshOwnerSession(); setState({ status: 'done' }); })
      .catch(caught => setState({ status: 'failed', message: caught instanceof ApiError && caught.code === 'invalid_token' ? t('auth.verifyFailed') : errorText(caught) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <AuthShell title={t('auth.verifyTitle')}>
    {state.status === 'working' && <p role="status" className="text-sm text-muted-foreground">{t('auth.verifying')}</p>}
    {state.status === 'done' && <><p role="status" className="text-sm">{t('auth.verified')}</p><Button onClick={() => navigate('/app')}>{t('auth.continue')}</Button></>}
    {state.status === 'failed' && <><Alert>{state.message}</Alert><Button asChild variant="outline"><Link to="/login">{t('auth.toLogin')}</Link></Button></>}
  </AuthShell>;
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, submit } = useSubmit(async () => { await forgotPassword(email.trim()); setSent(true); });
  return <AuthShell title={sent ? t('auth.checkEmailTitle') : t('auth.forgotTitle')} intro={sent ? t('auth.checkEmailBody') : t('auth.forgotIntro')}>
    {!sent && <form className="grid gap-4" onSubmit={event => void submit(event)} noValidate>
      <Field id="forgot-email" label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <Alert>{error}</Alert>
      <Button type="submit" disabled={busy || !email}>{busy ? t('auth.working') : t('auth.forgotAction')}</Button>
    </form>}
    <p className="text-sm"><Link className={linkClass} to="/login">{t('auth.backToLogin')}</Link></p>
  </AuthShell>;
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const token = useUrlToken();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, setError, submit } = useSubmit(async () => {
    if (!token) return;
    if (password !== confirm) { setError(t('auth.mismatch')); return; }
    await resetPassword(token, password);
    setDone(true);
  });
  if (!token) return <AuthShell title={t('auth.resetTitle')}>
    <Alert>{t('auth.resetNoToken')}</Alert>
    <Button asChild variant="outline"><Link to="/forgot-password">{t('auth.requestNew')}</Link></Button>
  </AuthShell>;
  if (done) return <AuthShell title={t('auth.resetTitle')}>
    <p role="status" className="text-sm">{t('auth.resetDone')}</p>
    <Button asChild><Link to="/login">{t('auth.toLogin')}</Link></Button>
  </AuthShell>;
  return <AuthShell title={t('auth.resetTitle')}>
    <form className="grid gap-4" onSubmit={event => void submit(event)} noValidate>
      <Field id="reset-password" label={t('auth.password')} hint={t('auth.passwordHint')} type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} />
      <Field id="reset-confirm" label={t('auth.confirmPassword')} type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
      <Alert>{error}</Alert>
      <Button type="submit" disabled={busy || password.length < 10}>{busy ? t('auth.working') : t('auth.resetAction')}</Button>
    </form>
  </AuthShell>;
}
