import { useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { admin } from '@/lib/api';
import type { AdminAuditEntry } from '@/lib/api-types';
import { SectionCard } from '../settings/Field';
import { ACTIONS, shortId, summarise } from './audit/format';
import { DataTable, Td, Tr } from './system/DataTable';
import { useWhen } from './system/format';

export function AuditPage() {
  const { t } = useTranslation('admin-audit');
  const when = useWhen();
  const [action, setAction] = useState('');
  const [since, setSince] = useState('');
  const [items, setItems] = useState<AdminAuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle');
  const [tick, setTick] = useState(0);
  // The date is a day in Bangkok time, the same zone the rest of the console shows.
  const query = useCallback((next?: string | null) => ({ action: action || undefined, since: since ? new Date(`${since}T00:00:00+07:00`).toISOString() : undefined, cursor: next }), [action, since]);

  useEffect(() => {
    let live = true;
    setStatus('loading'); setMore('idle');
    admin.audit(query()).then(page => { if (live) { setItems(page.items); setCursor(page.next_cursor); setStatus('ready'); } }).catch(() => { if (live) setStatus('error'); });
    return () => { live = false; };
  }, [query, tick]);

  async function loadMore() {
    setMore('loading');
    try { const page = await admin.audit(query(cursor)); setItems(rows => [...rows, ...page.items]); setCursor(page.next_cursor); setMore('idle'); } catch { setMore('error'); }
  }
  const filtered = action !== '' || since !== '';
  const head = [t('col.when'), t('col.who'), t('col.action'), t('col.target'), t('col.detail')];
  return <>
    <PageHeader icon={ScrollText} title={t('title')} lede={t('lede')} />
    <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5"><Label htmlFor="audit-action">{t('filter.action')}</Label>
          <Select id="audit-action" value={action} onChange={e => setAction(e.target.value)} className="sm:w-64">
            <option value="">{t('filter.allActions')}</option>
            {ACTIONS.map(a => <option key={a} value={a}>{t(`actions.${a}`)}</option>)}
          </Select></div>
        <div className="grid gap-1.5"><Label htmlFor="audit-since">{t('filter.since')}</Label>
          <Input id="audit-since" type="date" value={since} onChange={e => setSince(e.target.value)} className="sm:w-48" /></div>
        {filtered && <Button variant="ghost" onClick={() => { setAction(''); setSince(''); }}>{t('filter.clear')}</Button>}
      </div>
      <SectionCard title={t('log.title')} description={t('log.description')}>
        {status === 'error' ? <Alert severity="error" action={<Button variant="outline" size="sm" className="bg-card" onClick={() => setTick(n => n + 1)}>{t('retry')}</Button>}><p className="font-medium">{t('loadError.title')}</p><p className="text-muted-foreground">{t('loadError.hint')}</p></Alert>
          : status === 'loading' && items.length === 0 ? <div role="status" aria-label={t('loading')} className="grid gap-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
          : items.length === 0 ? <div className="rounded-lg border border-dashed p-4"><p className="font-medium">{t(filtered ? 'empty.filtered' : 'empty.none')}</p><p className="text-sm text-muted-foreground">{t(filtered ? 'empty.filteredHint' : 'empty.noneHint')}</p></div>
          : <>
            <DataTable label={t('log.title')} head={head}>
              {items.map(e => <Tr key={e.id}>
                <Td label={t('col.when')}><span className="tabular-nums">{when.full(e.created_at)}</span></Td>
                <Td label={t('col.who')}>{e.actor_email}</Td>
                <Td label={t('col.action')}><span className="font-medium">{t(`actions.${e.action}`, { defaultValue: e.action })}</span></Td>
                <Td label={t('col.target')}>{e.target_type ? <>{t(`targets.${e.target_type}`)} <code className="text-xs">{e.target_id ? shortId(e.target_id) : ''}</code></> : <span className="text-muted-foreground">–</span>}</Td>
                <Td label={t('col.detail')}><span className="text-muted-foreground">{summarise(e.detail) || '–'}</span></Td>
              </Tr>)}
            </DataTable>
            {(cursor || more === 'error') && <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" busy={more === 'loading'} onClick={() => void loadMore()}>{more === 'loading' ? t('loadingMore') : t('loadMore')}</Button>
              {more === 'error' && <p role="alert" className="text-sm text-destructive">{t('moreError')}</p>}
            </div>}
          </>}
      </SectionCard>
    </div>
  </>;
}
