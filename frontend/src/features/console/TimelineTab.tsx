import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { FitScore } from '@/components/FitScore';
import { SkillCount } from '@/components/SkillCoverage';
import { StatusBadge } from '@/components/StatusBadge';
import type { JobRevisionView, RunStatus, RunView } from '@/lib/api-types';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import type { Copy } from './copy';
import { Empty, relativeTime, useNow, type Locale } from './shared';

const ACTIVE: RunStatus[] = ['queued', 'running', 'waiting_approval'];
const groups = {
  all: () => true,
  active: (s: RunStatus) => s === 'queued' || s === 'running',
  waiting: (s: RunStatus) => s === 'waiting_approval',
  done: (s: RunStatus) => s === 'completed',
  failed: (s: RunStatus) => s === 'failed' || s === 'interrupted' || s === 'cancelled',
};
type Group = keyof typeof groups;

function duration(run: RunView, c: Copy) {
  if (!run.finished_at) return c.running;
  const seconds = Math.max(0, Math.round((Date.parse(run.finished_at) - Date.parse(run.created_at)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function TimelineTab({ projectId, locale, c }: { projectId: string; locale: Locale; c: Copy }) {
  const base = `/app/projects/${encodeURIComponent(projectId)}`;
  const runs = useResource<RunView[]>(`/projects/${encodeURIComponent(projectId)}/runs`);
  const jobs = useResource<JobRevisionView[]>(`/projects/${encodeURIComponent(projectId)}/jobs`);
  const [group, setGroup] = useState<Group>('all');
  const now = useNow(30000);
  const anyActive = (runs.data ?? []).some(run => ACTIVE.includes(run.status));
  const reload = runs.reload;
  useEffect(() => {
    if (!anyActive) return;
    const id = window.setInterval(reload, 5000);
    return () => window.clearInterval(id);
  }, [anyActive, reload]);
  const titles = useMemo(() => new Map((jobs.data ?? []).map(job => [job.id, job.title])), [jobs.data]);

  if (runs.status === 'error') return <ErrorState onRetry={runs.reload} />;
  if (runs.status === 'loading' && !runs.data) return <LoadingState />;
  const all = runs.data ?? [];
  if (all.length === 0) return <Empty title={c.noRuns} next={c.noRunsNext} />;
  const shown = all.filter(run => groups[group](run.status));
  const medium = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label={c.filterLabel} className="flex flex-wrap gap-2">
        {(Object.keys(groups) as Group[]).map(key => <Button key={key} type="button" size="sm" variant="outline" aria-pressed={group === key} onClick={() => setGroup(key)}>
          {c.filters[key]} <span className="tabular-nums text-muted-foreground">{all.filter(run => groups[key](run.status)).length}</span>
        </Button>)}
      </div>
      {anyActive && <p className="text-xs text-muted-foreground" role="status">{c.autoRefresh}</p>}
    </div>
    {shown.length === 0 ? <Empty title={c.noMatch} /> : <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[44rem] text-sm">
        <thead><tr className="border-b text-start text-muted-foreground">
          {[c.cols.op, c.cols.job, c.cols.status, c.cols.created, c.cols.duration, c.cols.score, c.cols.session].map(label => <th key={label} scope="col" className="px-3 py-2 text-start font-medium">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y">{shown.map(run => <tr key={run.id} className="align-middle">
          <td className="px-3 py-3 font-medium">{c.ops[run.operation]}
            {run.retry_of_id && <span className="ms-2 inline-block rounded-md border px-1.5 py-0.5 text-xs font-normal text-muted-foreground" title={c.retryOf}>{c.retry}</span>}
          </td>
          <td className="max-w-56 px-3 py-3 [overflow-wrap:anywhere]">{run.job_revision_id ? <Link className="hover:underline" to={`${base}/jobs/${encodeURIComponent(run.job_revision_id)}`}>{titles.get(run.job_revision_id) ?? c.untitled}</Link> : '—'}</td>
          <td className="px-3 py-3"><StatusBadge status={run.status} locale={locale} /></td>
          <td className="px-3 py-3 whitespace-nowrap"><time dateTime={run.created_at} title={medium.format(new Date(run.created_at))}>{relativeTime(run.created_at, now, locale)}</time></td>
          <td className="px-3 py-3 whitespace-nowrap tabular-nums">{duration(run, c)}</td>
          <td className="px-3 py-3">{run.evaluation_result ? <div className="flex flex-col items-start gap-1"><FitScore score={run.evaluation_result.score} locale={locale} /><SkillCount coverage={run.evaluation_result.skill_coverage} locale={locale} /></div> : '—'}</td>
          <td className="px-3 py-3 whitespace-nowrap"><Link className="text-primary hover:underline" to={`${base}/sessions/${encodeURIComponent(run.session_id)}`}>{c.openSession}</Link></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}
