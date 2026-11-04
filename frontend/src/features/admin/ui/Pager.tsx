import { useEffect, useRef, type RefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export const PAGE_SIZE = 10;

/** `?page=2` is 1-based in the URL (page 1 has no param); the API and components count from 0. */
export const pageFromParam = (value: string | null) => { const n = Number(value); return Number.isInteger(n) && n > 1 ? n - 1 : 0; };
export const pageToParam = (page: number) => (page > 0 ? String(page + 1) : null);

export type PagerLabels = { nav: string; range: (from: number, to: number, total: number) => string; page: (page: number, pages: number) => string; prev: string; next: string };

/** Translated strings for Pager, from the shared `admin-common` namespace. */
export function usePagerLabels(): PagerLabels {
  const { t } = useTranslation('admin-common');
  return { nav: t('pager.label'), range: (from, to, total) => t('pager.range', { from, to, total }), page: (page, pages) => t('pager.page', { page, pages }), prev: t('pager.prev'), next: t('pager.next') };
}

/**
 * Previous / next with "from–to of total"; renders nothing when everything fits on one page.
 * `anchor` is the table: it scrolls into view after paging only when its top is off screen.
 * Focus moves to the other button when the one just used becomes disabled.
 */
export function Pager({ page, total, onPage, labels, anchor, size = PAGE_SIZE }: { page: number; total: number; onPage: (page: number) => void; labels: PagerLabels; anchor?: RefObject<HTMLElement | null>; size?: number }) {
  const nav = useRef<HTMLElement>(null);
  const refocus = useRef<0 | 1 | null>(null); // 0 = previous button, 1 = next button
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => {
    if (refocus.current === null) return;
    nav.current?.querySelectorAll('button')[refocus.current]?.focus();
    refocus.current = null;
  }, [page]);
  if (pages === 1) return null;
  const from = page * size + 1, to = Math.min(total, (page + 1) * size);
  const go = (next: number) => {
    if (next === 0) refocus.current = 1; else if (next === pages - 1) refocus.current = 0;
    if ((anchor?.current?.getBoundingClientRect().top ?? 0) < 0) anchor?.current?.scrollIntoView({ block: 'start' });
    onPage(next);
  };
  return <nav ref={nav} aria-label={labels.nav} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
    <p className="tabular-nums text-muted-foreground" aria-live="polite">{labels.range(from, to, total)}</p>
    <div className="flex items-center gap-2">
      <span className="tabular-nums text-muted-foreground">{labels.page(page + 1, pages)}</span>
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => go(page - 1)} aria-label={labels.prev}><ChevronLeft size={16} aria-hidden="true" />{labels.prev}</Button>
      <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => go(page + 1)} aria-label={labels.next}>{labels.next}<ChevronRight size={16} aria-hidden="true" /></Button>
    </div>
  </nav>;
}
