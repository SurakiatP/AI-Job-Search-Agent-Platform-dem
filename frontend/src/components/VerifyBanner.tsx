import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resendVerification, useAccount } from '../lib/api';
import { Button } from './ui/button';

export function VerifyBanner() {
  const { t } = useTranslation();
  const account = useAccount();
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');
  if (!account || account.email_verified) return null;
  async function resend() {
    setState('busy');
    try { await resendVerification(); setState('sent'); } catch { setState('failed'); }
  }
  return <div role="region" aria-label={t('account.emailSection')} className="flex flex-wrap items-center gap-3 border-b border-warning/50 bg-warning/10 px-6 py-3 text-sm lg:px-10">
    <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t('account.bannerText')}</p>
    <span role="status" className="text-muted-foreground">{state === 'sent' ? t('account.resent') : ''}</span>
    {state === 'failed' && <span role="alert" className="text-destructive">{t('errors.request_failed')}</span>}
    <Button type="button" size="sm" variant="outline" disabled={state === 'busy' || state === 'sent'} onClick={() => void resend()}>{t('account.resend')}</Button>
  </div>;
}
