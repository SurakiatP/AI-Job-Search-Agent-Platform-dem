import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { refreshOwnerSession, resendVerification, useAccount, verifyEmailCode } from '../lib/api';
import { ApiError } from '../lib/api-types';
import { CodeInput } from './CodeInput';
import { Button } from './ui/button';

// Shown on every app page until the email is confirmed: type the emailed code here, or ask for a new email.
export function VerifyBanner() {
  const { t } = useTranslation();
  const account = useAccount();
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<'idle' | 'busy' | 'wrong' | 'failed'>('idle');
  if (!account || account.email_verified) return null;
  async function resend() {
    setState('busy');
    try { await resendVerification(); setState('sent'); } catch { setState('failed'); }
  }
  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!account || code.length !== 6 || codeState === 'busy') return;
    setCodeState('busy');
    try { await verifyEmailCode(account.email, code); await refreshOwnerSession(); } // the banner disappears once the session says verified
    catch (caught) { setCodeState(caught instanceof ApiError && caught.code === 'invalid_code' ? 'wrong' : 'failed'); }
  }
  const error = codeState === 'wrong' ? t('errors.invalid_code') : codeState === 'failed' ? t('errors.request_failed') : '';
  return <div role="region" aria-label={t('account.emailSection')} className="grid gap-2 border-b border-warning/50 bg-warning/10 px-6 py-3 text-sm lg:px-10">
    <div className="flex flex-wrap items-center gap-3">
      <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t('account.bannerText')}</p>
      <span role="status" className="text-muted-foreground">{state === 'sent' ? t('account.resent') : ''}</span>
      {state === 'failed' && <span role="alert" className="text-destructive">{t('errors.request_failed')}</span>}
      <Button type="button" size="sm" variant="outline" disabled={state === 'busy' || state === 'sent'} onClick={() => void resend()}>{t('account.resend')}</Button>
    </div>
    <form className="flex flex-wrap items-center gap-2" onSubmit={event => void confirm(event)} noValidate>
      <CodeInput aria-label={t('firstRun.verifyCode')} aria-describedby={error ? 'banner-code-error' : undefined} aria-invalid={error ? true : undefined} value={code} onChange={value => { setCode(value); if (codeState !== 'busy') setCodeState('idle'); }} className="h-9 max-w-40 bg-card text-base" />
      <Button type="submit" size="sm" busy={codeState === 'busy'} disabled={code.length !== 6 || codeState === 'busy'}>{t('firstRun.verifyAction')}</Button>
      <span id="banner-code-error" role="alert" className="text-destructive">{error}</span>
    </form>
  </div>;
}
