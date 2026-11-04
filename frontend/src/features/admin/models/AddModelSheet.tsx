import { useRef, useState } from 'react';
import { Check, Plus, Search, TriangleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { admin } from '@/lib/api';
import type { AdminModelCatalogItem } from '@/lib/api-types';
import { Sheet } from '../ui';
import { emptyPrice, errText, perMillion, priceBody, priceState, useCatalog, type PriceDraft } from './lib';
import { PriceForm } from './PriceForm';

const SHOWN = 20;
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** "openai/gpt-6-luna" with the provider muted and the model name strong. */
function ModelName({ id }: { id: string }) {
  const slash = id.indexOf('/');
  return <span className="[overflow-wrap:anywhere]">
    {slash > 0 ? <span className="text-muted-foreground">{id.slice(0, slash + 1)}</span> : null}<strong className="font-semibold">{id.slice(slash + 1)}</strong>
  </span>;
}

function Price({ label, value }: { label: string; value: number | null }) {
  return <div className="grid gap-0.5"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-medium tabular-nums">{perMillion(value)}</dd></div>;
}

/** Add a model from the OpenRouter list. A model with no price asks for one by hand before it is registered. */
export function AddModelSheet({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation('admin-models');
  const [q, setQ] = useState('');
  const searching = q.trim() !== '';
  const catalog = useCatalog(q, open && searching);
  const [added, setAdded] = useState<Record<string, true>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [price, setPrice] = useState<PriceDraft>(emptyPrice);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

  async function add(model: string, withPrice: boolean) {
    setBusy(model); setError(null);
    try {
      await admin.addModel({ model, ...(withPrice ? priceBody(price) : {}) });
      setAdded(a => ({ ...a, [model]: true })); setPending(null); setPrice(emptyPrice); onChanged();
    } catch (e) { setError(errText(t, e)); } finally { setBusy(null); }
  }

  const items = catalog.items.slice(0, SHOWN);
  const first = catalog.status === 'loading' && catalog.items.length === 0;
  const count = catalog.items.length;
  let status = '';
  if (searching && catalog.status === 'loading') status = t('change.searching');
  else if (searching && catalog.status === 'ready' && count > 0) status = count > SHOWN ? t('add.countCapped', { total: count, shown: SHOWN }) : t('add.count', { count });

  function row(i: AdminModelCatalogItem) {
    const noPrice = i.price_in == null || i.price_out == null;
    const isAdded = i.registered || added[i.id];
    return <li key={i.id} className="grid gap-3 px-4 py-3.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-40 flex-1 text-[15px] leading-snug">
          <ModelName id={i.id} />
          {i.name !== i.id ? <div className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{i.name}{i.context_length ? ` · ${t('add.context', { size: compact.format(i.context_length) })}` : ''}</div>
            : i.context_length ? <div className="mt-0.5 text-xs text-muted-foreground">{t('add.context', { size: compact.format(i.context_length) })}</div> : null}
        </div>
        {isAdded ? <span className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-success lg:min-h-9"><Check className="size-4" aria-hidden="true" />{t('add.added')}</span>
          : <Button size="sm" variant="outline" busy={busy === i.id} disabled={busy != null || pending === i.id} aria-label={t('add.addFor', { model: i.id })}
            onClick={() => { if (noPrice) { setPending(i.id); setPrice(emptyPrice); setError(null); } else void add(i.id, false); }}>{busy === i.id ? null : <Plus className="size-4" aria-hidden="true" />}{t('add.button')}</Button>}
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        {noPrice ? <Badge variant="warning"><TriangleAlert className="size-3" aria-hidden="true" />{t('change.noPrice')}</Badge>
          : <dl className="flex flex-wrap gap-x-6 gap-y-2" aria-label={t('add.perMillion')}>
            <Price label={t('add.priceIn')} value={i.price_in} /><Price label={t('add.priceOut')} value={i.price_out} /><Price label={t('add.priceCache')} value={i.price_cache} />
          </dl>}
        {i.registered ? <Badge variant="success" className="ms-auto">{t('add.registered')}</Badge> : null}
      </div>
      {pending === i.id ? <div className="grid gap-3 rounded-xl border bg-muted/40 p-3" role="group" aria-label={i.id}>
        <PriceForm value={price} onChange={setPrice} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={busy != null} onClick={() => setPending(null)}>{t('add.cancel')}</Button>
          <Button busy={busy === i.id} disabled={priceState(price) !== 'ok'} onClick={() => void add(i.id, true)}>{t('add.confirmPrice')}</Button>
        </div>
      </div> : null}
    </li>;
  }

  return <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }} closeLabel={t('close')} title={t('add.title')}>
    {error ? <Alert severity="error">{error}</Alert> : null}
    <div className="relative">
      <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input value={q} onChange={e => setQ(e.target.value)} autoComplete="off" spellCheck={false} type="text" inputMode="search" enterKeyHint="search" className="ps-10 pe-11"
        aria-label={t('change.search')} placeholder={t('add.hint')}
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); list.current?.querySelector('button')?.focus(); } }} />
      {q ? <button type="button" aria-label={t('add.clear')} onClick={() => setQ('')}
        className="absolute end-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" aria-hidden="true" /></button> : null}
    </div>
    <p role="status" className="-mt-3 min-h-5 text-xs text-muted-foreground">{status}</p>
    {!searching ? <div className="grid justify-items-center gap-1 rounded-xl border border-dashed px-4 py-10 text-center">
      <Search className="mb-1 size-6 text-muted-foreground" aria-hidden="true" /><p className="font-medium">{t('add.startTitle')}</p><p className="text-sm text-muted-foreground">{t('add.hint')}</p>
    </div> : null}
    {searching && catalog.status === 'error' ? <Alert severity="error" action={<Button size="sm" variant="outline" onClick={catalog.retry}>{t('load.retry')}</Button>}>{t('add.searchFailed')}</Alert> : null}
    {first ? <div className="grid gap-3" aria-hidden="true">{[0, 1, 2].map(n => <Skeleton key={n} className="h-24 rounded-xl" />)}</div> : null}
    {searching && catalog.status === 'ready' && count === 0 ? <div className="grid justify-items-center gap-1 rounded-xl border border-dashed px-4 py-10 text-center">
      <p className="font-medium [overflow-wrap:anywhere]">{t('add.emptyTitle', { q: q.trim() })}</p><p className="text-sm text-muted-foreground">{t('add.emptyHint')}</p>
    </div> : null}
    {items.length ? <ul ref={list} aria-label={t('add.results')} aria-busy={catalog.status === 'loading'} className={`divide-y rounded-xl border transition-opacity ${catalog.status === 'loading' ? 'opacity-60' : ''}`}>{items.map(row)}</ul> : null}
    <p className="text-sm text-muted-foreground">{t('add.note')}</p>
  </Sheet>;
}
