import { useMemo, useState, type KeyboardEvent } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AdminEffort, AdminRegisteredModel } from '@/lib/api-types';
import { EFFORTS, fromCatalog, needsPrice, perMillion, useCatalog, type Pick, type PriceDraft } from './lib';
import { Dots } from './parts';
import { PriceForm } from './PriceForm';

const SHOWN = 20;

export interface ModelPickerProps {
  registered: AdminRegisteredModel[];
  pick: Pick | null;
  onPick: (p: Pick) => void;
  price: PriceDraft;
  onPrice: (v: PriceDraft) => void;
  effort: AdminEffort;
  onEffort: (e: AdminEffort) => void;
}

/** Step 1 of the change sheet: search, choose one model (radio list), enter a price when none exists, choose the effort. */
export function ModelPicker({ registered, pick, onPick, price, onPrice, effort, onEffort }: ModelPickerProps) {
  const { t } = useTranslation('admin-models');
  const [q, setQ] = useState('');
  const searching = q.trim() !== '';
  const catalog = useCatalog(q, searching);
  const options = useMemo<Pick[]>(() => searching ? catalog.items.map(fromCatalog) : registered.map(m => ({ id: m.model, registered: true, priceIn: m.price_in, priceOut: m.price_out })), [searching, catalog.items, registered]);
  const shown = options.slice(0, SHOWN);
  const move = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = shown[(i + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length];
    onPick(next);
    document.getElementById(`opt-${next.id}`)?.focus();
  };
  const focusable = shown.some(o => o.id === pick?.id) ? pick?.id : shown[0]?.id;
  return <div className="grid gap-5">
    <label className="grid gap-1.5 text-sm font-medium">{t('change.search')}
      <Input value={q} onChange={e => setQ(e.target.value)} autoComplete="off" spellCheck={false} placeholder={t('change.searchHint')} />
    </label>
    {searching && catalog.status === 'error'
      ? <Alert severity="error" action={<Button size="sm" variant="outline" onClick={catalog.retry}>{t('load.retry')}</Button>}>{t('change.searchFailed')}</Alert>
      : <div className="grid gap-2">
        <p role="status" className="min-h-5 text-xs text-muted-foreground">{searching && catalog.status === 'loading' ? t('change.searching') : ''}</p>
        {shown.length === 0 && (!searching || catalog.status === 'ready')
          ? searching ? <p className="text-sm text-muted-foreground">{t('change.noResults', { q: q.trim() })}</p> : null
          : <div role="radiogroup" aria-label={t('change.options')} className="grid gap-2">
            {shown.map((o, i) => {
              const checked = o.id === pick?.id;
              const noPrice = !o.registered && (o.priceIn == null || o.priceOut == null);
              return <button key={o.id} id={`opt-${o.id}`} type="button" role="radio" aria-checked={checked} tabIndex={o.id === focusable ? 0 : -1} onClick={() => onPick(o)} onKeyDown={e => move(e, i)}
                className={cn('grid min-h-14 w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3.5 py-3 text-start transition-[border-color,background-color,transform] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  checked ? 'border-primary bg-accent/50' : 'hover:border-[color:var(--border-strong)]')}>
                <span className={cn('grid size-5 place-items-center rounded-full border-2', checked ? 'border-primary' : 'border-input')} aria-hidden="true">{checked ? <span className="size-2.5 rounded-full bg-primary" /> : null}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium [overflow-wrap:anywhere]">{o.id}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {o.registered ? <Badge variant="success"><Check className="size-3" aria-hidden="true" />{t('change.registered')}</Badge>
                      : noPrice ? <Badge variant="warning"><TriangleAlert className="size-3" aria-hidden="true" />{t('change.noPrice')}</Badge>
                      : <span>{t('change.willRegister')}</span>}
                  </span>
                </span>
                <span className="text-end text-xs leading-relaxed text-muted-foreground tabular-nums">
                  {o.priceIn == null || o.priceOut == null ? '—' : <>{t('change.in')} {perMillion(o.priceIn)}<br />{t('change.out')} {perMillion(o.priceOut)}</>}
                  <br />{t('change.per1m')}
                </span>
              </button>;
            })}
          </div>}
        {options.length > SHOWN ? <p className="text-xs text-muted-foreground">{t('change.more', { shown: SHOWN, total: options.length })}</p> : null}
      </div>}
    {pick && needsPrice(pick) ? <PriceForm value={price} onChange={onPrice} /> : null}
    <div className="grid gap-2 text-sm font-medium">{t('effort.label')}
      <div role="group" aria-label={t('effort.label')} className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {EFFORTS.map(e => <button key={e} type="button" aria-pressed={e === effort} onClick={() => onEffort(e)}
          className={cn('grid min-h-14 justify-items-center gap-1 rounded-[10px] border px-1 py-2 text-[13px] font-medium transition-[border-color,background-color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            e === effort ? 'border-primary bg-accent/60 text-primary' : 'bg-card hover:border-[color:var(--border-strong)]')}>
          <Dots effort={e} size={5} />{t(`effort.${e}`)}
        </button>)}
      </div>
      <p aria-live="polite" className="min-h-5 text-[13px] font-normal text-muted-foreground">{t(`effort.note.${effort}`)}</p>
    </div>
  </div>;
}
