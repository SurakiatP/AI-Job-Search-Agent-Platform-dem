import { useState } from 'react';
import { BadgeDollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { admin } from '@/lib/api';
import type { AdminRegisteredModel } from '@/lib/api-types';
import { Sheet } from '../ui';
import { errText, perMillion, priceBody, priceState, type PriceDraft } from './lib';
import { PriceForm } from './PriceForm';

const draftOf = (m: AdminRegisteredModel): PriceDraft => ({ in: m.price_in == null ? '' : String(m.price_in), out: m.price_out == null ? '' : String(m.price_out), cache: m.price_cache == null ? '' : String(m.price_cache), free: m.is_free });

/** Edit or first-time set of a model's price. Saving makes it a manual price; the new price applies to later requests only. */
export function EditPriceSheet({ open, model, onClose, onSaved }: { open: boolean; model: AdminRegisteredModel; onClose: () => void; onSaved: (message: string) => void }) {
  const { t } = useTranslation('admin-models');
  const [draft, setDraft] = useState(() => draftOf(model));
  const [busy, setBusy] = useState<'save' | 'official' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const official = model.official_price;

  async function run(kind: 'save' | 'official') {
    setBusy(kind); setError(null);
    try {
      if (kind === 'save') await admin.setModelPrice({ model: model.model, ...priceBody(draft) } as Parameters<typeof admin.setModelPrice>[0]);
      else await admin.useOfficialPrice(model.model);
      onSaved(t('library.saved', { model: model.model }));
    } catch (e) { setError(errText(t, e)); setBusy(null); }
  }
  return <Sheet open={open} onOpenChange={o => { if (!o && !busy) onClose(); }} closeLabel={t('close')} title={t('edit.title', { model: model.model })} subtitle={t('edit.sub')}
    footer={<>
      <Button variant="outline" disabled={busy != null} onClick={onClose}>{t('edit.cancel')}</Button>
      <Button busy={busy === 'save'} disabled={busy != null || priceState(draft) !== 'ok'} onClick={() => void run('save')}>{t('edit.save')}</Button>
    </>}>
    {error ? <Alert severity="error">{error}</Alert> : null}
    {official ? <Alert severity="info" action={<Button size="sm" variant="outline" busy={busy === 'official'} disabled={busy != null} onClick={() => void run('official')}>{t('edit.useOfficial')}</Button>}>
      <span className="flex gap-2"><BadgeDollarSign className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><span>{t('edit.official', { in: perMillion(official.price_in), out: perMillion(official.price_out) })}</span></span>
    </Alert> : null}
    <PriceForm value={draft} onChange={setDraft} warn={{ title: t('edit.warnTitle'), body: t('edit.warnBody') }} />
    <p className="text-sm text-muted-foreground">{t('edit.future')}</p>
  </Sheet>;
}
