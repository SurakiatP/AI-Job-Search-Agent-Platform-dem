import { useState } from 'react';
import { BadgeDollarSign, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { admin } from '@/lib/api';
import type { AdminRegisteredModel } from '@/lib/api-types';
import { Tip } from '../ui';
import { DeleteModelDialog } from './DeleteModelDialog';
import { EditPriceSheet } from './EditPriceSheet';
import { errText, perMillion, taskName, useDay } from './lib';
import { card } from './parts';
import { EmptyHint } from './states';

const cols = 'grid items-center gap-3 px-6 py-3.5 text-sm grid-cols-[minmax(0,1.4fr)_repeat(3,90px)_minmax(0,1fr)_100px_92px] max-lg:grid-cols-[minmax(0,1fr)_repeat(3,72px)] max-sm:px-4 max-sm:grid-cols-[minmax(0,1fr)_repeat(3,60px)] max-sm:gap-2';

export function LibraryTab({ models, onAdd, onChanged, onShowTasks }: { models: AdminRegisteredModel[]; onAdd: (opener: HTMLElement) => void; onChanged: () => void; onShowTasks: () => void }) {
  const { t } = useTranslation('admin-models');
  const day = useDay();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminRegisteredModel | null>(null);
  const [removing, setRemoving] = useState<AdminRegisteredModel | null>(null);
  async function useOfficial(model: string) {
    setBusy(model); setError(null);
    try { await admin.useOfficialPrice(model); onChanged(); } catch (e) { setError(errText(t, e)); } finally { setBusy(null); }
  }
  const upgrades = models.filter(m => m.official_price && m.price_source === 'manual');
  const source = (m: AdminRegisteredModel) => m.price_source === 'manual'
    ? <Badge variant="warning"><Pencil className="size-3" aria-hidden="true" />{t('library.src.manual')}</Badge>
    : <Badge variant="muted">{m.price_source ? t(`library.src.${m.price_source}`) : t('library.src.none')}{m.price_source === 'openrouter' ? ` · ${day(m.updated_at)}` : ''}</Badge>;
  return <div className="grid gap-4">
    {error ? <Alert severity="error">{error}</Alert> : null}
    {note ? <Alert severity="success">{note}</Alert> : null}
    {upgrades.map(m => <Alert key={m.model} severity="info" action={<Button size="sm" variant="outline" busy={busy === m.model} aria-label={t('library.useOfficialFor', { model: m.model })} onClick={() => useOfficial(m.model)}>{t('library.useOfficial')}</Button>}>
      <span className="flex gap-2"><BadgeDollarSign className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><span>{t('library.official', { model: m.model, in: perMillion(m.official_price!.price_in), out: perMillion(m.official_price!.price_out) })}</span></span>
    </Alert>)}
    <section className={card} aria-labelledby="lib-h">
      <div className="flex flex-wrap items-start gap-3 px-6 pb-4 pt-5 max-sm:px-4">
        <div className="min-w-60 flex-1"><h2 id="lib-h" className="text-lg font-semibold">{t('library.title')}</h2><p className="mt-0.5 text-sm text-muted-foreground">{t('library.sub')}</p></div>
        <Button size="sm" onClick={e => onAdd(e.currentTarget)}><Plus className="size-4" aria-hidden="true" />{t('library.add')}</Button>
      </div>
      {models.length === 0 ? <EmptyHint title={t('library.empty')} hint={t('library.emptyHint')} /> : <>
        <div className={`${cols} bg-muted py-2.5 text-xs font-medium text-muted-foreground`} aria-hidden="true">
          <span>{t('library.colModel')}</span><span className="text-end">{t('library.colIn')}</span><span className="text-end">{t('library.colOut')}</span><span className="text-end">{t('library.colCache')}</span>
          <span className="max-lg:hidden">{t('library.colSource')}</span><span className="text-end max-lg:hidden">{t('library.colUsed')}</span><span className="sr-only max-lg:hidden">{t('library.actions')}</span><span className="sr-only">{t('library.actions')}</span>
        </div>
        <ul className="divide-y divide-border">
          {models.map(m => <li key={m.model} className={cols}>
            <div className="min-w-0"><span className="font-medium [overflow-wrap:anywhere]">{m.model}</span>
              {m.is_free ? <Badge variant="success" className="ms-2">{t('library.free')}</Badge> : null}
              <div className="mt-1 flex flex-wrap gap-1.5 lg:hidden">{source(m)}<span className="text-xs text-muted-foreground">{m.used_by.length ? t('library.usedBy', { count: m.used_by.length }) : t('library.unused')}</span></div></div>
            {m.price_in == null || m.price_out == null
              ? <span className="col-span-3 flex flex-wrap items-center justify-end gap-x-2 gap-y-1"><Badge variant="warning">{t('library.noPriceYet')}</Badge>
                <Button size="sm" variant="outline" aria-label={t('library.setPriceFor', { model: m.model })} onClick={() => { setNote(null); setEditing(m); }}>{t('library.setPrice')}</Button></span>
              : <>
                <span className="text-end tabular-nums">{perMillion(m.price_in)}</span>
                <span className="text-end tabular-nums">{perMillion(m.price_out)}</span>
                <span className="text-end tabular-nums">{m.price_cache == null ? <Tip text={t('library.sameAsInputTip')}><span tabIndex={0} className="cursor-help text-muted-foreground">{t('library.sameAsInput')}</span></Tip> : perMillion(m.price_cache)}</span></>}
            <span className="max-lg:hidden">{source(m)}</span>
            <span className="text-end tabular-nums max-lg:hidden">{m.used_by.length ? <Tip text={m.used_by.map(op => taskName(t, op)).join(', ')}><span tabIndex={0}>{t('library.usedBy', { count: m.used_by.length })}</span></Tip> : <span className="text-muted-foreground">{t('library.unused')}</span>}</span>
            <span className="flex justify-end gap-1 max-lg:col-span-full">
              <Tip text={t('library.editFor', { model: m.model })}><Button size="icon-sm" variant="ghost" aria-label={t('library.editFor', { model: m.model })} onClick={() => { setNote(null); setEditing(m); }}><Pencil className="size-4" aria-hidden="true" /></Button></Tip>
              <Tip text={m.used_by.length ? t('library.removeBlocked', { tasks: m.used_by.map(op => taskName(t, op)).join(', ') }) : t('library.removeFor', { model: m.model })}>
                <Button size="icon-sm" variant="ghost" aria-label={t('library.removeFor', { model: m.model })} aria-disabled={m.used_by.length > 0 || undefined}
                  className={m.used_by.length ? 'text-foreground/38' : 'text-destructive hover:bg-destructive/10'} onClick={() => { setNote(null); setRemoving(m); }}><Trash2 className="size-4" aria-hidden="true" /></Button></Tip>
            </span>
          </li>)}
        </ul></>}
    </section>
    {editing ? <EditPriceSheet key={editing.model} open model={editing} onClose={() => setEditing(null)} onSaved={message => { setEditing(null); setNote(message); onChanged(); }} /> : null}
    {removing ? <DeleteModelDialog model={removing.model} usedBy={removing.used_by} onClose={() => setRemoving(null)} onShowTasks={() => { setRemoving(null); onShowTasks(); }}
      onRemoved={message => { setRemoving(null); setNote(message); onChanged(); }} /> : null}
  </div>;
}
