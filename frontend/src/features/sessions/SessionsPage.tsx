import { useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Briefcase, FileText, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { ItemMenu } from '@/components/ItemMenu';
import { apiRequest } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { JobRevisionView, Locale, RunView, SessionView } from '@/lib/api-types';
import { NewSessionButton } from './NewSessionDialog';
import { relativeTime } from '../console/shared';
import { useResource } from '../projects/useResource';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { notifyTrashChanged } from '@/lib/trash';

type Filter = 'all' | 'attention' | 'progress' | 'done' | 'stopped' | 'notStarted';
const FILTERS: Filter[] = ['all', 'attention', 'progress', 'done', 'stopped', 'notStarted'];
const columns = 'md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,11rem)_auto]';

// Group by the latest run of the session; `null` means no run yet.
function group(run: RunView | null): Filter {
  if (!run) return 'notStarted';
  if (run.status === 'waiting_approval' || run.status === 'needs_input') return 'attention';
  if (run.status === 'queued' || run.status === 'running') return 'progress';
  return run.status === 'completed' ? 'done' : 'stopped';
}

// The button names what happens next in this session, not a generic "open".
function nextAction(run: RunView | null, paired: boolean): string {
  if (!paired) return 'open';
  if (!run) return 'evaluate';
  switch (run.status) {
    case 'waiting_approval': return 'review';
    case 'needs_input': return run.operation === 'apply_prepare' ? 'answer' : 'review';
    case 'queued': case 'running': return 'progress';
    case 'completed': return 'result';
    case 'failed': return 'failed';
    default: return 'stopped';
  }
}

export function SessionsPage() {
  const { projectId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { t: s } = useTranslation('sessionWorkspace');
  const locale: Locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const sessions = useResource<SessionView[]>(`/projects/${projectId}/sessions`);
  // The project trash lives in the sidebar; the old `?view=trash` address goes there.
  const inTrash = useSearchParams()[0].get('view') === 'trash';
  const trashHref = `/app/projects/${projectId}/trash`;
  const reloadAll = () => { sessions.reload(); notifyTrashChanged(); };
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
  const jobs = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const [filter, setFilter] = useState<Filter>('all');
  const [removing, setRemoving] = useState<SessionView | null>(null);
  const [removed, setRemoved] = useState<SessionView | null>(null);
  const [undoFailed, setUndoFailed] = useState(false);
  async function undo(item: SessionView) {
    try { await apiRequest(`/projects/${projectId}/sessions/${item.id}/restore`, { method: 'POST' }); setRemoved(null); reloadAll(); } catch { setUndoFailed(true); }
  }
  const base = `/app/projects/${projectId}`;
  const list = sessions.data ?? [];
  // Without the run list we cannot tell the state, so rows fall back to a plain "Open" and filters hide.
  const known = runs.status !== 'error' && runs.data !== undefined;
  const latestRun = (id: string) => known ? [...(runs.data ?? [])].filter(run => run.session_id === id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null : null;
  const rows = list.map(session => ({ session, run: latestRun(session.id), paired: Boolean(session.cv_revision_id && session.job_revision_id) }));
  const counts = Object.fromEntries(FILTERS.map(key => [key, key === 'all' ? rows.length : rows.filter(row => group(row.run) === key).length])) as Record<Filter, number>;
  const shown = filter === 'all' || !known ? rows : rows.filter(row => group(row.run) === filter);
  const jobVersion = (id?: string | null) => (jobs.data ?? []).find(job => job.id === id)?.revision;
  if (inTrash) return <Navigate to={trashHref} replace />;
  return <section className="grid min-w-0 gap-6">
    <header className="workspace-page-header"><div><h1>{t('nav.evaluate')}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{s('list.subtitle')}</p></div><div className="flex flex-wrap items-center gap-2">{rows.length > 0 && <NewSessionButton projectId={projectId}>{t('workspace.newEvaluation')}</NewSessionButton>}</div></header>
    {removed && <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-4 py-2.5 text-sm">
      <Trash2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 basis-[calc(100%-2rem)] break-words sm:basis-auto">{undoFailed ? s('list.undoFailed') : s('list.moved', { title: removed.job_title ?? removed.title })}</span>
      <Button type="button" variant="ghost" size="sm" className="max-sm:ml-4" onClick={() => void undo(removed)}>{s('list.undo')}</Button>
      <Link className="inline-flex min-h-10 items-center font-medium text-primary hover:underline" to={trashHref}>{s('list.openTrash')}</Link>
      <Button type="button" variant="ghost" size="icon" className="max-sm:ml-auto" aria-label={s('list.dismiss')} onClick={() => setRemoved(null)}><X className="size-4" aria-hidden="true" /></Button>
    </div>}
    {sessions.status === 'loading' && !sessions.data ? <LoadingState /> : sessions.status === 'error' ? <ErrorState onRetry={sessions.reload} /> :
    rows.length === 0 ? <div className="workspace-panel grid justify-items-start gap-3 p-6 sm:p-8"><h2 className="text-lg font-semibold">{s('list.emptyTitle')}</h2><p className="max-w-xl text-muted-foreground">{s('list.emptyBody')}</p><NewSessionButton projectId={projectId} className="mt-1">{t('workspace.newEvaluation')}</NewSessionButton></div> : <>
      {known && rows.length > 1 && <div role="group" aria-label={s('list.filters.label')} className="flex flex-wrap gap-2">
        {FILTERS.filter(key => key === 'all' || counts[key] > 0).map(key => <Button key={key} type="button" size="sm" variant={filter === key ? 'secondary' : 'ghost'} aria-pressed={filter === key} onClick={() => setFilter(key)}>{s(`list.filters.${key}`)} ({counts[key]})</Button>)}
      </div>}
      <div className="workspace-panel overflow-hidden">
        <div className={cn('hidden gap-4 border-b px-6 py-3 text-sm font-medium text-muted-foreground md:grid', columns)} aria-hidden="true"><span>{s('list.opportunity')}</span><span>{s('list.comparedUsing')}</span><span>{s('list.latest')}</span><span>{s('list.next')}</span><span className="w-11" /></div>
        <ul className="divide-y">{shown.map(({ session, run, paired }) => {
          const action = known ? nextAction(run, paired) : 'open';
          const version = jobVersion(session.job_revision_id);
          const titleId = `eval-${session.id}`;
          return <li key={session.id} className={cn('relative grid min-w-0 items-center gap-3 p-4 sm:p-5 md:gap-4 md:px-6', columns)}>
            <div className="min-w-0 max-md:pr-10"><Link id={titleId} className="break-words font-semibold text-foreground hover:underline" to={`${base}/sessions/${session.id}`}>{session.job_title ?? session.title}</Link>{session.job_company && <p className="mt-0.5 break-words text-sm text-muted-foreground">{session.job_company}</p>}</div>
            <div className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs text-muted-foreground md:hidden">{s('list.comparedUsing')}</span>
              {paired ? <>
                <span className="flex min-w-0 items-start gap-2"><FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 break-words">{session.cv_name ?? session.cv_revision_id}{session.cv_revision != null ? ` · v${session.cv_revision}` : ''}</span></span>
                <span className="flex min-w-0 items-start gap-2"><Briefcase className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 break-words">{version != null ? s('list.jobVersion', { n: version }) : s('pair.job')}</span></span>
              </> : <span className="text-muted-foreground">{s('list.notPaired')}</span>}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {known && (run ? <StatusBadge status={run.status} locale={locale} /> : paired ? <Badge variant="outline" className="text-muted-foreground">{s('list.notEvaluated')}</Badge> : null)}
              {run && <span className="text-xs text-muted-foreground"><time dateTime={run.created_at}>{relativeTime(run.created_at, Date.now(), locale)}</time></span>}
            </div>
            <Button asChild variant="outline" className="h-auto min-h-11 w-full justify-between whitespace-normal py-2 text-left md:w-auto"><Link to={`${base}/sessions/${session.id}`} aria-describedby={titleId}>{s(`list.actions.${action}`)}<ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Link></Button>
            <ItemMenu className="max-md:absolute max-md:right-2 max-md:top-2 md:justify-self-end" label={s('list.options', { title: session.job_title ?? session.title })}
              actions={[{ label: s('list.delete.action'), icon: <Trash2 className="size-4" aria-hidden="true" />, destructive: true, onSelect: () => setRemoving(session) }]} />
          </li>;
        })}</ul>
      </div>
    </>}
    {removing && <ConfirmDeleteDialog confirmLabel={s('list.delete.action')}
      title={s('list.delete.title', { title: removing.job_title ?? removing.title })} description={s('list.delete.body')}
      errors={{ session_busy: s('list.delete.busy') }}
      onConfirm={() => apiRequest(`/projects/${projectId}/sessions/${removing.id}`, { method: 'DELETE' }).then(() => undefined)}
      onDone={() => { setRemoved(removing); setUndoFailed(false); setRemoving(null); reloadAll(); }} onClose={() => setRemoving(null)} />}
  </section>;
}
