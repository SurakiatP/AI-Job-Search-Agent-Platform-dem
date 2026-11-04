import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { admin } from '../../../lib/api';
import type { AdminPrefs } from '../../../lib/api-types';

const valid = (n: number) => Number.isFinite(n) && n > 0 && n <= 1000;

/** "1 USD = [rate] THB": saves thb_rate in the admin's prefs (the PUT also carries the stored widgets). */
export function RateControl({ prefs, loadFailed, onRetry, onSaved }: { prefs?: AdminPrefs; loadFailed: boolean; onRetry: () => void; onSaved: (p: AdminPrefs) => void }) {
  const { t } = useTranslation('admin-usage');
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => { if (prefs) setDraft(String(prefs.thb_rate)); }, [prefs?.thb_rate]);
  const n = Number(draft);
  const bad = draft.trim() === '' || !valid(n);
  const changed = !!prefs && n !== prefs.thb_rate;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!prefs || bad || !changed) return;
    setState('saving');
    try { onSaved(await admin.savePrefs({ ...prefs, thb_rate: n })); setState('saved'); } catch { setState('error'); }
  };

  if (loadFailed) return <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{t('rate.loadError')}
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>{t('rate.retry')}</Button></p>;
  return <form onSubmit={submit} className="grid gap-1.5" noValidate>
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="usage-rate" className="text-sm font-medium">{t('rate.label')}</label>
      <Input id="usage-rate" type="number" inputMode="decimal" step="any" min="0" className="w-28" value={draft} disabled={!prefs}
        aria-invalid={draft !== '' && bad ? true : undefined} aria-describedby="usage-rate-note"
        onChange={e => { setDraft(e.target.value); setState('idle'); }} />
      <span className="text-sm text-muted-foreground">{t('rate.unit')}</span>
      <Button type="submit" variant="outline" size="sm" disabled={!prefs || bad || !changed || state === 'saving'}>{t('rate.save')}</Button>
    </div>
    <p id="usage-rate-note" role={state === 'error' ? 'alert' : 'status'} className={`min-h-5 text-xs ${state === 'error' || (draft !== '' && bad) ? 'text-destructive' : 'text-muted-foreground'}`}>
      {state === 'error' ? t('rate.saveError') : draft !== '' && bad ? t('rate.invalid') : state === 'saved' ? t('rate.saved') : ''}
    </p>
  </form>;
}
