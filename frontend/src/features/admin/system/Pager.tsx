import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export const PAGE_SIZE = 10;

/** Previous / next with "from–to of total"; renders nothing when everything fits on one page. */
export function Pager({ page, total, onPage, size = PAGE_SIZE }: { page: number; total: number; onPage: (page: number) => void; size?: number }) {
  const { t } = useTranslation('admin-system');
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages === 1) return null;
  const from = page * size + 1, to = Math.min(total, (page + 1) * size);
  return <nav aria-label={t('pager.label')} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
    <p className="tabular-nums text-muted-foreground" aria-live="polite">{t('pager.range', { from, to, total })}</p>
    <div className="flex items-center gap-2">
      <span className="tabular-nums text-muted-foreground">{t('pager.page', { page: page + 1, pages })}</span>
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label={t('pager.prev')}><ChevronLeft size={16} aria-hidden="true" />{t('pager.prev')}</Button>
      <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label={t('pager.next')}>{t('pager.next')}<ChevronRight size={16} aria-hidden="true" /></Button>
    </div>
  </nav>;
}
