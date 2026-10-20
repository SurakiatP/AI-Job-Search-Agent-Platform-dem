// Trashed evaluations: restore or delete for good. Same shape as the documents trash.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { apiRequest } from '@/lib/api';
import { ApiError, type Locale, type SessionView } from '@/lib/api-types';
import { relativeTime } from '../console/shared';

export function SessionTrash({ projectId, locale, items, onChanged, showBack = true }: { projectId: string; locale: Locale; items: SessionView[]; onChanged: () => void; showBack?: boolean }) {
  const { t: s } = useTranslation('sessionWorkspace');
  const base = `/app/projects/${projectId}`;
  const api = `/projects/${projectId}/sessions`;
  const [busyId, setBusyId] = useState('');
  const [failure, setFailure] = useState<ReactNode>('');
  const [target, setTarget] = useState<SessionView | 'all' | null>(null);
  const name = (item: SessionView) => item.job_title ?? item.title;

  async function restore(item: SessionView) {
    setBusyId(item.id); setFailure('');
    try { await apiRequest(`${api}/${item.id}/restore`, { method: 'POST' }); onChanged(); } catch (caught) {
      const holder = caught instanceof ApiError && caught.code === 'session_pair_exists' ? caught.fields?.session_id : undefined;
      setFailure(holder ? <>{s('trash.pairExists')} <Link className="font-medium underline" to={`${base}/sessions/${holder}`}>{s('trash.openIt')}</Link></>
        : s('trash.restoreFailed', { title: name(item) }));
    } finally { setBusyId(''); }
  }
  const purge = (id: string) => apiRequest(`${api}/${id}/permanent`, { method: 'DELETE' }).then(() => undefined);
  async function emptyTrash() {
    const failed: string[] = [];
    for (const item of items) {
      try { await purge(item.id); } catch (caught) { if (!(caught instanceof ApiError && caught.status === 404)) failed.push(name(item)); }
    }
    onChanged();
    if (failed.length) throw new Error(failed.join(', '));
  }

  return <div className="grid gap-4">
    {showBack && <Button asChild variant="ghost" className="-ml-3 justify-self-start"><Link to={`${base}/sessions`}><ArrowLeft className="size-4" aria-hidden="true" />{s('trash.back')}</Link></Button>}
    {items.length === 0 ? <p className="text-muted-foreground">{s('trash.empty')}</p> : <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">{s('trash.note')}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setTarget('all')}><Trash2 className="size-4" aria-hidden="true" />{s('trash.emptyAll')}</Button>
      </div>
      {failure && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{failure}</p>}
      <ul className="workspace-panel divide-y overflow-hidden">{items.map(item => <li key={item.id} className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
        <div className="min-w-0">
          <p className="break-words font-semibold">{name(item)}</p>
          <p className="mt-0.5 break-words text-sm text-muted-foreground">
            {[item.job_company, item.cv_name && `${item.cv_name}${item.cv_revision != null ? ` · v${item.cv_revision}` : ''}`].filter(Boolean).join(' · ')}
            {item.trashed_at && <> · {s('trash.trashed')} <time dateTime={item.trashed_at}>{relativeTime(item.trashed_at, Date.now(), locale)}</time></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busyId === item.id} onClick={() => void restore(item)}><RotateCcw className="size-4" aria-hidden="true" />{s('trash.restore')}</Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => setTarget(item)}>{s('trash.purge')}</Button>
        </div>
      </li>)}</ul>
    </>}
    {target && <ConfirmDeleteDialog
      confirmLabel={target === 'all' ? s('trash.emptyAll') : s('trash.purge')}
      title={target === 'all' ? s('trash.emptyTitle', { n: items.length }) : s('trash.purgeTitle', { title: name(target) })}
      description={s('trash.purgeBody')}
      errors={{ session_busy: s('list.delete.busy') }}
      onConfirm={() => target === 'all' ? emptyTrash() : purge(target.id)}
      onDone={() => { setTarget(null); onChanged(); }} onClose={() => setTarget(null)} />}
  </div>;
}
