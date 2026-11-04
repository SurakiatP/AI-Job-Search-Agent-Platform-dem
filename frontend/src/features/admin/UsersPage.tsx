import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { admin } from '../../lib/api';
import type { AdminUserItem, AdminUserStatus } from '../../lib/api-types';
import { Pager, pageFromParam, pageToParam, Segmented, usePagerLabels } from './ui';
import { RangeSelect, type UserRange } from './users/shared';
import { UserSheet } from './users/UserSheet';
import { UsersTable } from './users/UsersTable';

type Status = 'all' | AdminUserStatus;
const STATUSES: Status[] = ['all', 'active', 'suspended', 'deleting'];
const PAGE_SIZE = 10;

export function UsersPage() {
  const { t } = useTranslation('admin-users');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [range, setRange] = useState<UserRange>('7d');
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<AdminUserItem | null>(null);
  const seq = useRef(0);
  const tableTop = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const page = pageFromParam(params.get('page'));
  const labels = usePagerLabels();
  const setPage = useCallback((p: number) => setParams(prev => { const n = new URLSearchParams(prev); const v = pageToParam(p); if (v) n.set('page', v); else n.delete('page'); return n; }, { replace: true }), [setParams]);
  // A new search, status or range always starts at the first page.
  const first = useCallback(() => setPage(0), [setPage]);

  useEffect(() => { const id = window.setTimeout(() => { if (text.trim() !== q) { setQ(text.trim()); first(); } }, 300); return () => window.clearTimeout(id); }, [text, q, first]);

  const query = useCallback(() => ({ q: q || undefined, status: status === 'all' ? undefined : status, range, page, page_size: PAGE_SIZE }), [q, status, range, page]);

  useEffect(() => {
    const mine = ++seq.current;
    setState(s => (s === 'ready' ? s : 'loading')); setFetching(true);
    admin.users(query()).then(res => {
      if (mine !== seq.current) return;
      if (res.page !== page) { setPage(res.page); return; } // the server clamps an out-of-range page; follow it in the URL
      setItems(res.items); setTotal(res.total); setState('ready'); setFetching(false);
      setOpen(o => (o ? res.items.find(i => i.id === o.id) ?? o : o));
    }).catch(() => { if (mine === seq.current) { setState('error'); setFetching(false); } });
  }, [query, reload, page, setPage]);

  const count = state === 'ready' ? t('count', { count: total }) : null;
  const filtered = !!q || status !== 'all';
  return <div className="grid gap-6">
    <PageHeader icon={Users} title={t('title')} lede={<>{t('lede')}{count ? <span className="mt-1 block font-medium tabular-nums text-foreground">{count}</span> : null}</>} />
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1 basis-64 sm:max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" value={text} onChange={e => setText(e.target.value)} placeholder={t('search')} aria-label={t('search')} className="ps-9" />
      </div>
      <Segmented ariaLabel={t('statusLabel')} value={status} onChange={v => { setStatus(v); first(); }} options={STATUSES.map(s => ({ value: s, label: t(`status.${s}`) }))} />
      <RangeSelect value={range} onChange={v => { setRange(v); first(); }} />
    </div>
    {state === 'loading' ? <div className="grid gap-px overflow-hidden rounded-xl border bg-card" role="status" aria-label={t('title')}>
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex items-center gap-4 p-4"><Skeleton className="h-5 w-56 max-w-[50%]" /><Skeleton className="ms-auto h-5 w-20" /></div>)}
    </div> : state === 'error' ? <div role="alert" className="grid justify-items-start gap-2 rounded-xl border bg-card p-6">
      <p className="font-medium">{t('listFailed')}</p><p className="text-sm text-muted-foreground">{t('listFailedHint')}</p>
      <Button variant="outline" onClick={() => { setState('loading'); setReload(n => n + 1); }}>{t('retry')}</Button>
    </div> : items.length === 0 ? <div className="grid gap-1 rounded-xl border bg-card p-6">
      <h2 className="text-lg font-medium">{t('emptyTitle')}</h2><p className="text-muted-foreground">{t(filtered ? 'emptyFiltered' : 'emptyAll')}</p>
    </div> : <>
      <div ref={tableTop} aria-busy={fetching} className={fetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}><UsersTable items={items} onOpen={setOpen} /></div>
      <Pager page={page} total={total} onPage={setPage} labels={labels} anchor={tableTop} />
    </>}
    <p className="text-sm text-muted-foreground">{t('privacy')}</p>
    <UserSheet user={open} onClose={() => setOpen(null)} onChanged={() => setReload(n => n + 1)} />
  </div>;
}
