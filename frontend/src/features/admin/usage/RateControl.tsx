import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { AdminFxRate } from '../../../lib/api-types';
import { safeHttpUrl } from '../../projects/useResource';
import { dayLabel } from './format';

/** Read-only "1 USD = 35.12 THB" with where the rate comes from (fetched live by the backend; nobody can edit it). */
export function RateControl({ fx, loadFailed, onRetry, lang }: { fx?: AdminFxRate; loadFailed: boolean; onRetry: () => void; lang: string }) {
  const { t } = useTranslation('admin-usage');
  if (loadFailed) return <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{t('rate.loadError')}
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>{t('rate.retry')}</Button></p>;
  if (!fx) return null;
  const href = safeHttpUrl(fx.source_url);
  return <div className="grid gap-1 text-sm">
    <p className="m-0 font-medium tabular-nums" data-testid="usage-rate">{t('rate.label')} {fx.rate.toFixed(2)} {t('rate.unit')}</p>
    <p className="m-0 text-xs text-muted-foreground">{t('rate.source')} {href ? <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{fx.source}</a> : fx.source}. {t('rate.asOf', { date: dayLabel(fx.as_of, lang) })}</p>
    {fx.stale ? <p role="status" className="m-0 text-xs text-destructive">{t('rate.stale')}</p> : null}
  </div>;
}
