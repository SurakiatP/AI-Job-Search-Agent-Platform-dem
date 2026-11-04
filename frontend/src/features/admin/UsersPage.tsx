import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { admin } from '../../lib/api';
import type { AdminUserItem, AdminUserStatus } from '../../lib/api-types';
import { Segmented } from './ui';
import { RangeSelect, type UserRange } from './users/shared';
import { UserSheet } from './users/UserSheet';
import { UsersTable } from './users/UsersTable';

type Status = 'all' | AdminUserStatus;
const STATUSES: Status[] = ['all', 'active', 'suspended', 'deleting'];

export function UsersPage() {
  const { t } = useTranslation('admin-users');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [range, setRange] = useState<UserRange>('7d');
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState<'idle' | 'busy' | 'error'>('idle');
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<AdminUserItem | null>(null);
  const seq = useRef(0);

  useEffect(() => { const id = window.setTimeout(() => setQ(text.trim()), 300); return () => window.clearTimeout(id); }, [text]);

  const query = useCallback((cursor?: string | null) => ({ q: q || undefined, status: status === 'all' ? undefined : status, range, cursor }), [q, status, range]);

  useEffect(() => {
    const mine = ++seq.current;
    setState(s => (s === 'ready' ? s : 'loading')); setMore('idle');
    admin.users(query()).then(page => {
      if (mine !== seq.current) return;
      setItems(page.items); setNext(page.next_cursor); setState('ready');
      setOpen(o => (o ? page.items.find(i => i.id === o.id) ?? o : o));
    }).catch(() => { if (mine === seq.current) setState('error'); });
  }, [query, reload]);

  async function loadMore() {
    const mine = seq.current;
    setMore('busy');
    try {
      const page = await admin.users(query(next));
      if (mine !== seq.current) return;
      setItems(list => [...list, ...page.items.filter(i => !list.some(l => l.id === i.id))]); setNext(page.next_cursor); setMore('idle');
    } catch { if (mine === seq.current) setMore('error'); }
  }

  const count = state === 'ready' ? (next ? t('countMore', { count: items.length }) : t('count', { count: items.length })) : null;
  const filtered = !!q || status !== 'all';
  return <div className="grid gap-6">
    <PageHeader icon={Users} title={t('title')} lede={<>{t('lede')}{count ? <span className="mt-1 block font-medium tabular-nums text-foreground">{count}</span> : null}</>} />
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1 basis-64 sm:max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" value={text} onChange={e => setText(e.target.value)} placeholder={t('search')} aria-label={t('search')} className="ps-9" />
      </div>
      <Segmented ariaLabel={t('statusLabel')} value={status} onChange={setStatus} options={STATUSES.map(s => ({ value: s, label: t(`status.${s}`) }))} />
      <RangeSelect value={range} onChange={setRange} />
    </div>
    {state === 'loading' ? <div className="grid gap-px overflow-hidden rounded-xl border bg-card" role="status" aria-label={t('title')}>
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex items-center gap-4 p-4"><Skeleton className="h-5 w-56 max-w-[50%]" /><Skeleton className="ms-auto h-5 w-20" /></div>)}
    </div> : state === 'error' ? <div role="alert" className="grid justify-items-start gap-2 rounded-xl border bg-card p-6">
      <p className="font-medium">{t('listFailed')}</p><p className="text-sm text-muted-foreground">{t('listFailedHint')}</p>
      <Button variant="outline" onClick={() => { setState('loading'); setReload(n => n + 1); }}>{t('retry')}</Button>
    </div> : items.length === 0 ? <div className="grid gap-1 rounded-xl border bg-card p-6">
      <h2 className="text-lg font-medium">{t('emptyTitle')}</h2><p className="text-muted-foreground">{t(filtered ? 'emptyFiltered' : 'emptyAll')}</p>
    </div> : <>
      <UsersTable items={items} onOpen={setOpen} />
      {more === 'error' ? <p role="alert" className="text-sm text-destructive">{t('loadMoreFailed')}</p> : null}
      {next ? <div className="flex justify-center"><Button variant="outline" busy={more === 'busy'} onClick={loadMore}>{more === 'error' ? t('retry') : t('loadMore')}</Button></div> : null}
    </>}
    <p className="text-sm text-muted-foreground">{t('privacy')}</p>
    <UserSheet user={open} onClose={() => setOpen(null)} onChanged={() => setReload(n => n + 1)} />
  </div>;
}
