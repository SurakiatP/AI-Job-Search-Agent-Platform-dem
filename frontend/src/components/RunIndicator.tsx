import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useResource } from '../features/projects/useResource';
import type { RunView } from '../lib/api-types';

// Shows only while a run is working or waiting for the person; links to where it is handled.
export function RunIndicator({ projectId, compact = false }: { projectId?: string; compact?: boolean }) {
  const { t } = useTranslation();
  const runs = useResource<RunView[]>(projectId ? `/projects/${projectId}/runs` : null);
  const reload = runs.reload;
  const list = runs.data ?? [];
  const needs = list.filter(run => run.status === 'needs_input' || run.status === 'waiting_approval').length;
  const working = list.filter(run => run.status === 'queued' || run.status === 'running').length;
  const live = needs + working > 0;
  useEffect(() => {
    if (!projectId || !live) return;
    const timer = window.setInterval(reload, 8000);
    return () => window.clearInterval(timer);
  }, [projectId, live, reload]);
  if (!projectId || !live) return null;
  const label = needs ? t('runs.needsYou', { count: needs }) : t('runs.working', { count: working });
  return <Link to={`/app/projects/${projectId}/console?tab=runs`} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-xs font-medium lg:min-h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${needs ? 'border-primary text-primary' : 'text-muted-foreground'}`}>
    <span aria-hidden="true" className={`size-2 rounded-full ${needs ? 'bg-primary' : 'animate-pulse bg-ai motion-reduce:animate-none'}`} />
    <span className={compact ? 'sr-only sm:not-sr-only' : undefined}>{label}</span>
  </Link>;
}
