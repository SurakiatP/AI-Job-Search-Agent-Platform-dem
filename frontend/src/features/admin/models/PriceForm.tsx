import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { priceState, type PriceDraft } from './lib';

/** Manual price for a model neither OpenRouter nor LiteLLM prices. A price of 0 needs the free box. */
export function PriceForm({ value, onChange, warn }: { value: PriceDraft; onChange: (v: PriceDraft) => void; warn?: { title: string; body: string } }) {
  const { t } = useTranslation('admin-models');
  const needFree = priceState(value) === 'needs_free';
  const field = (key: 'in' | 'out' | 'cache', placeholder?: string) => <label className="grid gap-1.5 text-sm font-medium">{t(`price.${key}`)}
    <span className="relative block">
      <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
      <Input inputMode="decimal" autoComplete="off" className="pl-7 tabular-nums" placeholder={placeholder} value={value[key]} aria-invalid={key !== 'cache' && needFree && Number(value[key]) === 0 && value[key].trim() !== '' ? true : undefined}
        onChange={e => onChange({ ...value, [key]: e.target.value })} />
    </span>
  </label>;
  return <div className="grid gap-3 rounded-xl bg-warning/10 p-4">
    <div className="flex gap-3 text-sm leading-relaxed">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
      <div><strong>{warn?.title ?? t('price.warnTitle')}</strong> {warn?.body ?? t('price.warnBody')}</div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">{field('in')}{field('out')}{field('cache', t('price.cachePlaceholder'))}</div>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-5 accent-[color:var(--primary)]" checked={value.free} onChange={e => onChange({ ...value, free: e.target.checked })} />{t('price.free')}
    </label>
    <p role="status" className="min-h-5 text-sm text-warning">{needFree ? t('price.needFree') : ''}</p>
  </div>;
}
