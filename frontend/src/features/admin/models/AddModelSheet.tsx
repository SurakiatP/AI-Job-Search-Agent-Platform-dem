import { useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { admin } from '@/lib/api';
import { Sheet } from '../ui';
import { emptyPrice, errText, perMillion, priceBody, priceState, useCatalog, type PriceDraft } from './lib';
import { PriceForm } from './PriceForm';

const SHOWN = 30;

/** Add a model from the OpenRouter list. A model with no price asks for one by hand before it is registered. */
export function AddModelSheet({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation('admin-models');
  const [q, setQ] = useState('');
  const catalog = useCatalog(q, open && q.trim() !== '');
  const [added, setAdded] = useState<Record<string, true>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [price, setPrice] = useState<PriceDraft>(emptyPrice);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(model: string, withPrice: boolean) {
    setBusy(model); setError(null);
    try {
      await admin.addModel({ model, ...(withPrice ? priceBody(price) : {}) });
      setAdded(a => ({ ...a, [model]: true })); setPending(null); setPrice(emptyPrice); onChanged();
    } catch (e) { setError(errText(t, e)); } finally { setBusy(null); }
  }
  const items = catalog.items.slice(0, SHOWN);
  return <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }} closeLabel={t('close')} title={t('add.title')}>
    {error ? <Alert severity="error">{error}</Alert> : null}
    <label className="grid gap-1.5 text-sm font-medium">{t('change.search')}
      <Input value={q} onChange={e => setQ(e.target.value)} autoComplete="off" spellCheck={false} placeholder={t('add.hint')} />
    </label>
    {q.trim() !== '' && catalog.status === 'error' ? <Alert severity="error" action={<Button size="sm" variant="outline" onClick={catalog.retry}>{t('load.retry')}</Button>}>{t('change.searchFailed')}</Alert> : null}
    <p role="status" className="-mb-3 min-h-5 text-xs text-muted-foreground">{catalog.status === 'loading' ? t('change.searching') : ''}</p>
    {catalog.status === 'ready' && items.length === 0 ? <p className="text-sm text-muted-foreground">{t('change.noResults', { q: q.trim() })}</p> : null}
    {items.length ? <ul className="divide-y rounded-xl border">
      {items.map(i => {
        const noPrice = i.price_in == null || i.price_out == null;
        const isAdded = i.registered || added[i.id];
        return <li key={i.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3 text-sm">
          <span className="min-w-40 flex-1 font-medium [overflow-wrap:anywhere]">{i.id}</span>
          {noPrice ? <Badge variant="warning"><TriangleAlert className="size-3" aria-hidden="true" />{t('change.noPrice')}</Badge>
            : <span className="text-xs text-muted-foreground tabular-nums">{t('add.price', { in: perMillion(i.price_in), out: perMillion(i.price_out) })}</span>}
          {isAdded ? <Badge variant="success"><Check className="size-3" aria-hidden="true" />{t('add.added')}</Badge>
            : <Button size="sm" variant="outline" busy={busy === i.id} aria-label={t('add.addFor', { model: i.id })}
              onClick={() => { if (noPrice) { setPending(i.id); setPrice(emptyPrice); setError(null); } else void add(i.id, false); }}>{t('add.button')}</Button>}
        </li>;
      })}
    </ul> : null}
    {pending ? <div className="grid gap-3 rounded-xl border p-4" role="group" aria-label={pending}>
      <strong className="text-sm [overflow-wrap:anywhere]">{pending}</strong>
      <PriceForm value={price} onChange={setPrice} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setPending(null)}>{t('add.cancel')}</Button>
        <Button busy={busy === pending} disabled={priceState(price) !== 'ok'} onClick={() => add(pending, true)}>{t('add.confirmPrice')}</Button>
      </div>
    </div> : null}
    <p className="text-sm text-muted-foreground">{t('add.note')}</p>
  </Sheet>;
}
