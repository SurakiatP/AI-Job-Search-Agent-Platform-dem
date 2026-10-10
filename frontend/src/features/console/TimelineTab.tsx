import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { FitScore } from '@/components/FitScore';
import { SkillCount } from '@/components/SkillCoverage';
import { StatusBadge } from '@/components/StatusBadge';
import type { JobRevisionView, RunEventView, RunStatus, RunView } from '@/lib/api-types';
import { fetchRunEvents } from '@/lib/run-events';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import type { Copy } from './copy';
import { Empty, relativeTime, useNow, type Locale } from './shared';

const ACTIVE: RunStatus[] = ['queued', 'running', 'waiting_approval'];
const groups = {
  all: () => true,
  active: (s: RunStatus) => s === 'queued' || s === 'running',
  waiting: (s: RunStatus) => s === 'waiting_approval',
  needsYou: (s: RunStatus) => s === 'needs_input',
  done: (s: RunStatus) => s === 'completed',
  failed: (s: RunStatus) => s === 'failed' || s === 'interrupted' || s === 'cancelled',
};
type Group = keyof typeof groups;

function duration(run: RunView, c: Copy) {
  if (!run.finished_at) return run.status === 'needs_input' ? c.waitingInput : c.running;
  const seconds = Math.max(0, Math.round((Date.parse(run.finished_at) - Date.parse(run.created_at)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function requesterLabel(run: RunView, c: Copy) {
  const r = run.requester;
  if (!r || r.kind === 'owner') return c.you;
  return `${c.agentBy} · ${r.label || (r.grant_id ?? '').slice(0, 8)}`;
}

function RunDetails({ projectId, run, c }: { projectId: string; run: RunView; c: Copy }) {
  const [events, setEvents] = useState<RunEventView[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { fetchRunEvents(projectId, run.id).then(setEvents).catch(() => setFailed(true)); }, [projectId, run.id, run.status]);
  if (failed) return <p role="alert" className="text-sm text-destructive">{c.detailsFailed}</p>;
  if (!events) return <p role="status" className="text-sm text-muted-foreground">…</p>;
  const rounds = events.filter(e => e.data.step === 'llm_round');
  const sum = (key: 'latency_ms' | 'input_tokens' | 'output_tokens') => rounds.reduce((n, e) => n + (e.data[key] ?? 0), 0);
  const reported = rounds.some(e => e.data.input_tokens != null || e.data.output_tokens != null);
  const secs = (ms: number | null | undefined) => ms == null ? '—' : `${(ms / 1000).toFixed(1)} ${c.seconds}`;
  const tok = (n: number | null | undefined) => n == null ? '—' : String(n);
  const lines = events.filter(e => e.event_type === 'run_resumed' || e.event_type === 'run_needs_input' || e.data.step === 'llm_round');
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">{c.noEvents}</p>;
  return <div className="grid gap-2 text-sm">
    <ul className="grid gap-1">{lines.map(e => <li key={e.sequence} className="[overflow-wrap:anywhere]">
      {e.event_type === 'run_resumed' ? c.resumed : e.event_type === 'run_needs_input' ? c.needsInput
        : <>{c.llmRound} · {e.data.model ?? '—'} · {secs(e.data.latency_ms)} · {tok(e.data.input_tokens)} {c.tokensIn} / {tok(e.data.output_tokens)} {c.tokensOut}</>}
    </li>)}</ul>
    {rounds.length > 0 && <p className="font-medium">{c.total}: {rounds.length} {c.rounds} · {secs(sum('latency_ms'))}{reported && <> · {sum('input_tokens')} {c.tokensIn} / {sum('output_tokens')} {c.tokensOut}</>}</p>}
  </div>;
}

export function TimelineTab({ projectId, locale, c }: { projectId: string; locale: Locale; c: Copy }) {
  const base = `/app/projects/${encodeURIComponent(projectId)}`;
  const runs = useResource<RunView[]>(`/projects/${encodeURIComponent(projectId)}/runs`);
  const jobs = useResource<JobRevisionView[]>(`/projects/${encodeURIComponent(projectId)}/jobs`);
  const [group, setGroup] = useState<Group>('all');
  const [open, setOpen] = useState<string | null>(null);
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
      <table className="w-full min-w-[52rem] text-sm">
        <thead><tr className="border-b text-start text-muted-foreground">
          {[c.cols.op, c.cols.job, c.cols.status, c.cols.created, c.cols.duration, c.cols.score, c.cols2, c.cols.session].map(label => <th key={label} scope="col" className="px-3 py-2 text-start font-medium">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y">{shown.map(run => <Fragment key={run.id}><tr className="align-middle">
          <td className="px-3 py-3 font-medium">{c.ops[run.operation]}
            {run.retry_of_id && <span className="ms-2 inline-block rounded-md border px-1.5 py-0.5 text-xs font-normal text-muted-foreground" title={c.retryOf}>{c.retry}</span>}
          </td>
          <td className="max-w-56 px-3 py-3 [overflow-wrap:anywhere]">{run.job_revision_id ? <Link className="hover:underline" to={`${base}/jobs/${encodeURIComponent(run.job_revision_id)}`}>{titles.get(run.job_revision_id) ?? c.untitled}</Link> : '—'}</td>
          <td className="px-3 py-3"><StatusBadge status={run.status} locale={locale} /></td>
          <td className="px-3 py-3 whitespace-nowrap"><time dateTime={run.created_at} title={medium.format(new Date(run.created_at))}>{relativeTime(run.created_at, now, locale)}</time></td>
          <td className="px-3 py-3 whitespace-nowrap tabular-nums">{duration(run, c)}</td>
          <td className="px-3 py-3">{run.evaluation_result ? <div className="flex flex-col items-start gap-1"><FitScore score={run.evaluation_result.score} locale={locale} /><SkillCount coverage={run.evaluation_result.skill_coverage} locale={locale} /></div> : '—'}</td>
          <td className="px-3 py-3 [overflow-wrap:anywhere]">{requesterLabel(run, c)}</td>
          <td className="px-3 py-3 whitespace-nowrap"><Link className="text-primary hover:underline" to={`${base}/sessions/${encodeURIComponent(run.session_id)}`}>{c.openSession}</Link>
            {run.status !== 'queued' && run.status !== 'running' && <Button type="button" variant="ghost" size="sm" className="ms-2" aria-expanded={open === run.id} onClick={() => setOpen(open === run.id ? null : run.id)}>{open === run.id ? c.hideDetails : c.details}</Button>}
          </td>
        </tr>{open === run.id && <tr><td colSpan={8} className="bg-muted/40 px-3 py-3"><RunDetails projectId={projectId} run={run} c={c} /></td></tr>}</Fragment>)}</tbody>
      </table>
    </div>}
  </div>;
}
