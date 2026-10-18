import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useAccount } from './api';
import { ApiError } from './api-types';

// Run-starting and grant-issuing controls stay disabled until the email is confirmed; the server enforces the same rule.
export function useRunGate(): { blocked: boolean; title?: string } {
  const { t } = useTranslation();
  const account = useAccount();
  return account && !account.email_verified ? { blocked: true, title: t('account.verifyFirst') } : { blocked: false };
}

// Localised text for the two account-level API errors, or null for any other error.
export function accountErrorText(t: TFunction, error: unknown, locale: string): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === 'email_unverified') return t('errors.email_unverified');
  if (error.code === 'quota_exceeded') {
    const at = new Date(error.fields?.reset_at ?? '');
    const time = Number.isNaN(at.getTime()) ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(at);
    return t('errors.quota_exceeded', { time });
  }
  return null;
}

// Only operators can open the AI gateway settings; everyone else is told to contact them instead of being sent to a hidden page.
export function useGatewayHelp(locale: 'th' | 'en'): { isAdmin: boolean; contactText: string } {
  const isAdmin = useAccount()?.is_admin === true;
  return { isAdmin, contactText: locale === 'th' ? 'ตอนนี้ยังใช้ AI ไม่ได้ โปรดติดต่อผู้ดูแลระบบ' : 'AI is not available right now. Please contact your administrator.' };
}
