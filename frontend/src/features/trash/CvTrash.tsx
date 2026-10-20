// Trashed CVs: restore, or delete their content for good (CR-CVT-01). Same shape as the evaluation trash.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { apiRequest } from '@/lib/api';
import { ApiError, type CVView, type Locale } from '@/lib/api-types';
import { relativeTime } from '../console/shared';

export function CvTrash({ projectId, locale, items, onChanged }: { projectId: string; locale: Locale; items: CVView[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const api = `/projects/${projectId}/cvs`;
  const [busyId, setBusyId] = useState('');
  const [failure, setFailure] = useState('');
  const [target, setTarget] = useState<CVView | 'all' | null>(null);

  async function restore(item: CVView) {
    setBusyId(item.id); setFailure('');
    try { await apiRequest(`${api}/${item.id}/restore`, { method: 'POST' }); onChanged(); }
    catch { setFailure(t('trash.cv.restoreFailed', { name: item.name })); }
    finally { setBusyId(''); }
  }
  const purge = (id: string) => apiRequest(`${api}/${id}/permanent`, { method: 'DELETE' }).then(() => undefined);
  async function emptyTrash() {
    const failed: string[] = [];
    for (const item of items) {
      try { await purge(item.id); } catch (caught) { if (!(caught instanceof ApiError && caught.status === 404)) failed.push(item.name); }
    }
    onChanged();
    if (failed.length) throw new ApiError(409, { code: 'cv_in_use', message_key: '', retryable: false });
  }

  return <div className="grid gap-4">
    {items.length === 0 ? <p className="text-muted-foreground">{t('trash.cv.empty')}</p> : <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">{t('trash.cv.note')}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setTarget('all')}><Trash2 className="size-4" aria-hidden="true" />{t('trash.cv.emptyAll')}</Button>
      </div>
      {failure && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{failure}</p>}
      <ul className="workspace-panel divide-y overflow-hidden">{items.map(item => <li key={item.id} className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
        <div className="min-w-0">
          <p className="break-words font-semibold [overflow-wrap:anywhere]">{item.name}</p>
          <p className="mt-0.5 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {item.latest_revision && `${item.latest_revision.original_filename} · v${item.latest_revision.revision}`}
            {item.trashed_at && <>{item.latest_revision && ' · '}{t('trash.cv.trashed')} <time dateTime={item.trashed_at}>{relativeTime(item.trashed_at, Date.now(), locale)}</time></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busyId === item.id} onClick={() => void restore(item)}><RotateCcw className="size-4" aria-hidden="true" />{t('trash.cv.restore')}</Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => setTarget(item)}>{t('trash.cv.purge')}</Button>
        </div>
      </li>)}</ul>
    </>}
    {target && <ConfirmDeleteDialog
      confirmLabel={target === 'all' ? t('trash.cv.emptyAll') : t('trash.cv.purge')}
      title={target === 'all' ? t('trash.cv.emptyTitle', { n: items.length }) : t('trash.cv.purgeTitle', { name: target.name })}
      description={t('trash.cv.note')}
      errors={{ cv_in_use: t('trash.cv.inUse') }}
      onConfirm={() => target === 'all' ? emptyTrash() : purge(target.id)}
      onDone={() => { setTarget(null); onChanged(); }} onClose={() => setTarget(null)} />}
  </div>;
}
