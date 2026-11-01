import type { TFunction } from 'i18next';

// Wait text for a rate-limited reply: seconds under two minutes, otherwise whole minutes rounded up.
export function rateLimitText(t: TFunction, retryAfter: unknown): string {
  const seconds = Math.max(1, Math.ceil(Number(retryAfter) || 60));
  return seconds < 120 ? t('errors.rate_limited', { seconds }) : t('errors.rate_limited_minutes', { count: Math.ceil(seconds / 60) });
}
