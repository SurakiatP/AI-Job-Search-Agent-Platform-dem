import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Check, CheckCircle2, Circle, MailCheck, TriangleAlert } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { Header } from '../../components/Header';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { PasswordInput } from '../../components/PasswordInput';
import { Label } from '../../components/ui/label';
import { forgotPassword, login, refreshOwnerSession, resendVerification, resetPassword, signup, useOwnerSession, verifyEmail, verifyEmailCode } from '../../lib/api';
import { CodeInput } from '../../components/CodeInput';
import { ApiError } from '../../lib/api-types';
import { authCopy } from './copy';

const linkClass = 'rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// One layout for all five pages: shared header, then a split panel (login, sign up) or a single centred card (recovery, verify).
export function AuthLayout({ title, intro, side, icon, children }: { title: string; intro?: string; side?: ReactNode; icon?: ReactNode; children: ReactNode }) {
  const body = <div className="grid content-center gap-5 p-6 sm:p-10">
    <div className="grid gap-2">
      {icon}
      <h1 className="text-2xl font-semibold leading-snug [overflow-wrap:anywhere]">{title}</h1>
      {intro && <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>}
    </div>
    {children}
  </div>;
  return <>
    <Header />
    <main id="main-content" tabIndex={-1} className={`mx-auto w-full px-4 py-8 sm:py-14 ${side ? 'max-w-4xl' : 'max-w-md'}`}>
      <div className={side ? 'grid overflow-hidden rounded-xl border bg-card text-card-foreground md:grid-cols-2' : 'rounded-xl border bg-card text-card-foreground'}>
        {body}
        {side && <aside className="grid content-center gap-5 border-t bg-muted p-6 sm:p-10 md:order-first md:border-t-0 md:border-r">{side}</aside>}
      </div>
    </main>
  </>;
}

function Field({ id, label, hint, ...props }: { id: string; label: string; hint?: ReactNode } & React.ComponentProps<typeof Input>) {
  return <div className="grid gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    {props.type === 'password'
      ? <PasswordInput id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      : <Input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />}
    {hint && <div id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</div>}
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

// Live length rule: icon + text, not colour alone.
function PasswordRule({ length }: { length: number }) {
  const { locale } = useLocale();
  const c = authCopy[locale];
  const ok = length >= 10 && length <= 128;
  const Icon = ok ? Check : Circle;
  return <p className={`flex items-center gap-1.5 ${ok ? 'text-success' : ''}`}><Icon className="size-3.5 shrink-0" aria-hidden="true" />{length > 128 ? c.passwordRuleLong : c.passwordRule}</p>;
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

function SidePoints({ title, children }: { title: string; children: ReactNode }) {
  return <>
    <p className="text-2xl font-semibold leading-snug [overflow-wrap:anywhere] sm:text-3xl">{title}</p>
    {children}
  </>;
}

export function LoginPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const c = authCopy[locale];
  const session = useOwnerSession();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, submit } = useSubmit(() => login(email.trim(), password));
  if (session.status === 'ready') return <Navigate to={next} replace />;
  return <AuthLayout title={c.loginTitle} intro={t('auth.loginIntro')} side={<SidePoints title={c.loginSide.title}>
    <ul className="grid gap-2 text-muted-foreground">{c.loginSide.points.map(point => <li key={point}>{point}</li>)}</ul>
  </SidePoints>}>
    {params.get('notice') === 'password-reset' && <p role="status" className="text-sm text-success">{c.loginNotice}</p>}
    {params.get('notice') === 'verified' && <p role="status" className="text-sm text-success">{locale === 'th' ? 'ยืนยันอีเมลแล้ว เข้าสู่ระบบได้เลย' : 'Email verified. You can log in now.'}</p>}
    <form className="grid gap-4" onSubmit={event => void submit(event)} noValidate>
      <Field id="login-email" label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <Field id="login-password" label={t('auth.password')} type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
      <Alert>{error}</Alert>
      <Button type="submit" busy={busy} disabled={busy || !email || !password}>{busy ? t('auth.working') : t('auth.loginAction')}</Button>
    </form>
    <p className="text-sm"><Link className={linkClass} to="/forgot-password">{t('auth.forgotLink')}</Link></p>
    <p className="border-t pt-4 text-sm text-muted-foreground">{t('auth.noAccount')} <Link className={linkClass} to="/signup">{t('auth.toSignup')}</Link></p>
  </AuthLayout>;
}

export function SignupPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const c = authCopy[locale];
  const session = useOwnerSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const { busy, error, submit } = useSubmit(async () => { await signup(email.trim(), password, locale); setSent(true); });
  const verify = useSubmit(async () => { await verifyEmailCode(email.trim(), code); navigate('/login?notice=verified', { replace: true }); });
  const otp = locale === 'th'
    ? { label: 'รหัส 6 หลักจากอีเมล', hint: 'กรอกรหัสที่เราส่งให้ หรือกดลิงก์ในอีเมลก็ได้ รหัสหมดอายุใน 10 นาที', action: 'ยืนยันอีเมล' }
    : { label: '6-digit code from the email', hint: 'Enter the code we sent, or use the link in the email. The code expires in 10 minutes.', action: 'Verify email' };
  if (session.status === 'ready') return <Navigate to="/app" replace />;
  if (sent) return <AuthLayout title={t('auth.checkEmailTitle')} intro={t('auth.checkEmailBody')} icon={<MailCheck className="size-8 text-primary" aria-hidden="true" />}>
    <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{c.sentTo} <span className="font-medium text-foreground">{email.trim()}</span></p>
    <form className="grid gap-3 rounded-lg border bg-card p-4" onSubmit={event => void verify.submit(event)} noValidate>
      <Label htmlFor="signup-code">{otp.label}</Label>
      <CodeInput id="signup-code" value={code} onChange={setCode} aria-describedby="signup-code-hint" />
      <p id="signup-code-hint" className="text-xs text-muted-foreground">{otp.hint}</p>
      <Alert>{verify.error}</Alert>
      <Button type="submit" busy={verify.busy} disabled={verify.busy || code.length !== 6} className="justify-self-start">{otp.action}</Button>
    </form>
    <p className="text-sm text-muted-foreground">{c.noMail}</p>
    <Button variant="outline" onClick={() => setSent(false)}>{c.differentEmail}</Button>
    <p className="text-sm"><Link className={linkClass} to="/login">{t('auth.toLogin')}</Link></p>
  </AuthLayout>;
  return <AuthLayout title={c.signupTitle} intro={t('auth.signupIntro')} side={<SidePoints title={c.signupSide.title}>
    <ol className="grid gap-4">{c.signupSide.steps.map((step, index) => <li key={step.title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-background text-sm font-semibold text-primary">{index + 1}</span>
      <span className="grid gap-0.5"><span className="font-medium leading-snug">{step.title}</span><span className="text-sm text-muted-foreground">{step.body}</span></span>
    </li>)}</ol>
  </SidePoints>}>
    <form className="grid gap-4" onSubmit={event => void submit(event)} noValidate>
      <Field id="signup-email" label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <Field id="signup-password" label={t('auth.password')} hint={<PasswordRule length={password.length} />} type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} />
      <Alert>{error}</Alert>
      <Button type="submit" busy={busy} disabled={busy || !email || password.length < 10}>{busy ? t('auth.working') : t('auth.signupAction')}</Button>
      <p className="text-sm text-muted-foreground">{c.next}</p>
    </form>
    <p className="border-t pt-4 text-sm text-muted-foreground">{t('auth.haveAccount')} <Link className={linkClass} to="/login">{t('auth.toLogin')}</Link></p>
  </AuthLayout>;
}

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const c = authCopy[locale];
  const navigate = useNavigate();
  const session = useOwnerSession();
  const signedIn = session.status === 'ready';
  const token = useUrlToken();
  const errorText = useErrorText();
  const started = useRef(false);
  const [state, setState] = useState<{ status: 'working' } | { status: 'done' } | { status: 'failed'; message: string }>({ status: 'working' });
  const [resend, setResend] = useState<{ status: 'idle' | 'busy' | 'sent' } | { status: 'failed'; message: string }>({ status: 'idle' });
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) { setState({ status: 'failed', message: t('auth.verifyFailed') }); return; }
    verifyEmail(token)
      .then(() => { void refreshOwnerSession(); setState({ status: 'done' }); })
      .catch(caught => setState({ status: 'failed', message: caught instanceof ApiError && caught.code === 'invalid_token' ? t('auth.verifyFailed') : errorText(caught) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function requestNew() {
    setResend({ status: 'busy' });
    try { await resendVerification(); setResend({ status: 'sent' }); }
    catch (caught) { setResend({ status: 'failed', message: errorText(caught) }); }
  }
  const done = state.status === 'done';
  const failed = state.status === 'failed';
  return <AuthLayout title={done ? c.verifiedTitle : failed ? c.verifyFailedTitle : t('auth.verifyTitle')}
    icon={done ? <CheckCircle2 className="size-8 text-success" aria-hidden="true" /> : failed ? <TriangleAlert className="size-8 text-destructive" aria-hidden="true" /> : undefined}>
    {state.status === 'working' && <p role="status" className="text-sm text-muted-foreground">{t('auth.verifying')}</p>}
    {done && <>
      <p role="status" className="text-sm text-muted-foreground">{signedIn ? c.verifiedSignedIn : c.verifiedSignedOut}</p>
      {signedIn ? <Button onClick={() => navigate('/app/projects')}>{c.toProjects}</Button> : <Button asChild><Link to="/login?next=%2Fapp%2Fprojects">{c.loginToContinue}</Link></Button>}
    </>}
    {state.status === 'failed' && <>
      <Alert>{state.message}</Alert>
      <p className="text-sm text-muted-foreground">{c.verifyFailedHint}</p>
      {signedIn ? <>
        <Button variant="outline" disabled={resend.status === 'busy' || resend.status === 'sent'} onClick={() => void requestNew()}>{c.sendNewLink}</Button>
        {resend.status === 'sent' && <p role="status" className="text-sm text-success">{c.newLinkSent}</p>}
        {resend.status === 'failed' && <p className="text-sm text-destructive [overflow-wrap:anywhere]">{resend.message}</p>}
        <p className="text-sm"><Link className={linkClass} to="/app/projects">{c.toProjects}</Link></p>
      </> : <Button asChild variant="outline"><Link to="/login">{c.loginToRequest}</Link></Button>}
    </>}
  </AuthLayout>;
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const c = authCopy[locale];
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, submit } = useSubmit(async () => { await forgotPassword(email.trim()); setSent(true); });
  return <AuthLayout title={sent ? t('auth.checkEmailTitle') : t('auth.forgotTitle')} intro={sent ? t('auth.checkEmailBody') : t('auth.forgotIntro')} icon={sent ? <MailCheck className="size-8 text-primary" aria-hidden="true" /> : undefined}>
    {!sent && <form className="grid gap-4" onSubmit={event => void submit(event)} noValidate>
      <Field id="forgot-email" label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <Alert>{error}</Alert>
      <Button type="submit" busy={busy} disabled={busy || !email}>{busy ? t('auth.working') : t('auth.forgotAction')}</Button>
    </form>}
    {sent && <Button variant="outline" onClick={() => setSent(false)}>{c.differentEmail}</Button>}
    <p className="text-sm"><Link className={`${linkClass} inline-flex items-center gap-1`} to="/login"><ArrowLeft className="size-4" aria-hidden="true" />{t('auth.backToLogin')}</Link></p>
  </AuthLayout>;
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const c = authCopy[locale];
  const navigate = useNavigate();
  const token = useUrlToken();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [expired, setExpired] = useState(false);
  const { busy, error, setError, submit } = useSubmit(async () => {
    if (!token) return;
    if (password !== confirm) { setError(t('auth.mismatch')); return; }
    try { await resetPassword(token, password); }
    catch (caught) { if (caught instanceof ApiError && caught.code === 'invalid_token') { setExpired(true); return; } throw caught; }
    navigate('/login?notice=password-reset', { replace: true });
  });
  if (!token || expired) return <AuthLayout title={t('auth.resetTitle')} icon={<TriangleAlert className="size-8 text-destructive" aria-hidden="true" />}>
    <Alert>{expired ? c.resetExpired : t('auth.resetNoToken')}</Alert>
    <Button asChild><Link to="/forgot-password">{t('auth.requestNew')}</Link></Button>
    <p className="text-sm"><Link className={linkClass} to="/login">{t('auth.backToLogin')}</Link></p>
  </AuthLayout>;
  return <AuthLayout title={t('auth.resetTitle')}>
    <form className="grid gap-4" onSubmit={event => void submit(event)} noValidate>
      <Field id="reset-password" label={t('auth.password')} hint={<PasswordRule length={password.length} />} type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} />
      <Field id="reset-confirm" label={t('auth.confirmPassword')} type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
      <Alert>{error}</Alert>
      <Button type="submit" busy={busy} disabled={busy || password.length < 10}>{busy ? t('auth.working') : t('auth.resetAction')}</Button>
    </form>
  </AuthLayout>;
}
