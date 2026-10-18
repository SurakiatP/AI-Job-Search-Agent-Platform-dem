import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, FileText, Info, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import type { JobRevisionView, RunEventView, RunOperation, RunStatus, RunView } from '@/lib/api-types';
import { fetchRunEvents, watchRun } from '@/lib/run-events';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import type { Copy } from './copy';
import { Empty, relativeTime, useNow, type Locale } from './shared';

const ACTIVE: RunStatus[] = ['queued', 'running', 'waiting_approval'];
const GROUPS = [
  { key: 'decision', statuses: ['waiting_approval', 'needs_input'] },
  { key: 'running', statuses: ['queued', 'running'] },
  { key: 'finished', statuses: ['completed', 'failed', 'interrupted', 'cancelled'] },
] as const;

// Where a run's one button really goes: runs without a session of their own never claim one.
function destination(run: RunView, base: string, c: Copy) {
  if (run.status === 'waiting_approval') return { to: `${base}/console?tab=approvals`, label: c.dest.approvals };
  const op: RunOperation = run.operation;
  if (op === 'profile_cv' || op === 'extract_experience') return { to: `${base}/profile`, label: c.dest.cv };
  if (op === 'match_jobs') return { to: `${base}/search`, label: c.dest.search };
  return { to: `${base}/sessions/${encodeURIComponent(run.session_id)}`, label: c.dest.session };
}

const unit = (locale: Locale, value: number, name: 'second' | 'minute' | 'hour') => new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'narrow' }).format(value);

function span(ms: number, locale: Locale) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  return minutes < 60 ? unit(locale, minutes, 'minute') : `${unit(locale, Math.floor(minutes / 60), 'hour')} ${unit(locale, minutes % 60, 'minute')}`;
}

function duration(run: RunView, locale: Locale) {
  const ms = Date.parse(run.finished_at ?? run.created_at) - Date.parse(run.created_at);
  return ms < 60000 ? unit(locale, Math.max(0, Math.round(ms / 1000)), 'second') : span(ms, locale);
}

function requesterLabel(run: RunView, c: Copy) {
  const r = run.requester;
  if (!r || r.kind === 'owner') return null;
  return `${c.agentBy} · ${r.label || (r.grant_id ?? '').slice(0, 8)}`;
}

// Live step text comes from the run's SSE stream; only mounted for running rows.
function LiveStep({ projectId, run, c, onDone }: { projectId: string; run: RunView; c: Copy; onDone: () => void }) {
  const [step, setStep] = useState<string | null>(null);
  useEffect(() => watchRun(projectId, run.id, 0, event => {
    if (event.data.step) setStep(event.data.step);
    if (event.data.status && event.data.status !== 'running' && event.data.status !== 'queued') onDone();
  }), [projectId, run.id, onDone]);
  return <span>{step ? c.steps[step] ?? c.working : run.status === 'queued' ? c.queuedNote : c.working}</span>;
}

// One-line failure reason from the event payload (message_key) when the run recorded one.
function FailureReason({ projectId, run, c }: { projectId: string; run: RunView; c: Copy }) {
  const { t, i18n } = useTranslation();
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchRunEvents(projectId, run.id).then(events => {
      const key = [...events].reverse().find(event => event.data.message_key)?.data.message_key;
      if (live && key && i18n.exists(key)) setReason(t(key));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [projectId, run.id, i18n, t]);
  return <>{run.status === 'failed' ? c.failedNote : c.interruptedNote}{reason && <> {c.failedReason}: {reason}</>}</>;
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
  const [open, setOpen] = useState<string | null>(null);
  const now = useNow(15000);
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
  const all = [...(runs.data ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  if (all.length === 0) return <Empty title={c.noRuns} next={c.noRunsNext} />;
  const medium = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const idle = !all.some(run => run.status === 'queued' || run.status === 'running');

  function row(run: RunView, primary: boolean) {
    const dest = destination(run, base, c);
    const meta = [run.job_revision_id ? titles.get(run.job_revision_id) ?? c.untitled : null, requesterLabel(run, c)].filter((part): part is string => !!part);
    const finished = run.status === 'completed' || run.status === 'failed' || run.status === 'interrupted' || run.status === 'cancelled';
    const note = run.status === 'waiting_approval' ? c.needsDecisionNote : run.status === 'needs_input' ? c.needsInputNote : run.status === 'cancelled' ? c.cancelledNote : null;
    return <li key={run.id} className="grid gap-3 py-4 first:pt-3 last:pb-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground" aria-hidden="true">
          {run.operation === 'evaluate_job' || run.operation === 'match_jobs' ? <Search className="size-4" /> : <FileText className="size-4" />}
        </span>
        <div className="grid min-w-0 gap-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            <span className="[overflow-wrap:anywhere]">{c.ops[run.operation]}</span>
            <StatusBadge status={run.status} locale={locale} />
            {run.retry_of_id && <span className="rounded-md border px-1.5 py-0.5 text-xs font-normal text-muted-foreground" title={c.retryOf}>{c.retry}</span>}
          </p>
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {meta.join(' · ')}{meta.length > 0 && ' · '}
            <time dateTime={run.created_at} title={medium.format(new Date(run.created_at))}>{relativeTime(run.created_at, now, locale)}</time>
            {run.status === 'running' && <> · {span(now - Date.parse(run.created_at), locale)} {c.elapsed}</>}
            {finished && run.finished_at && <> · {duration(run, locale)}</>}
          </p>
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {run.status === 'running' || run.status === 'queued' ? <LiveStep projectId={projectId} run={run} c={c} onDone={reload} />
              : run.status === 'failed' || run.status === 'interrupted' ? <FailureReason projectId={projectId} run={run} c={c} /> : note}
          </p>
          {finished && run.status !== 'cancelled' && <div>
            <Button type="button" variant="ghost" size="sm" className="-ms-3 text-muted-foreground" aria-expanded={open === run.id} onClick={() => setOpen(open === run.id ? null : run.id)}>{open === run.id ? c.hideDetails : c.details}</Button>
            {open === run.id && <div className="rounded-lg bg-muted/40 p-3"><RunDetails projectId={projectId} run={run} c={c} /></div>}
          </div>}
        </div>
      </div>
      <Button asChild variant={primary ? 'default' : 'outline'} className="w-full sm:w-auto"><Link to={dest.to}>{dest.label}<ArrowRight className="size-4" aria-hidden="true" /></Link></Button>
    </li>;
  }

  return <div className="grid gap-4">
    {anyActive && <p className="text-xs text-muted-foreground" role="status">{c.autoRefresh}</p>}
    {idle && <p className="text-sm text-muted-foreground">{c.nothingRunning}</p>}
    {GROUPS.map(({ key, statuses }) => {
      const items = all.filter(run => (statuses as readonly RunStatus[]).includes(run.status));
      if (items.length === 0) return null;
      const [title, hint] = c.groups[key];
      return <section key={key} aria-labelledby={`activity-${key}`} className="rounded-xl border bg-card px-4 py-4 sm:px-5">
        <h2 id={`activity-${key}`} className="text-lg font-semibold">{title} <span className="tabular-nums text-muted-foreground">({items.length})</span></h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
        <ul className="mt-2 divide-y">{items.map(run => row(run, key === 'decision'))}</ul>
      </section>;
    })}
    <p className="flex items-start gap-2 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{c.footer}</p>
  </div>;
}
