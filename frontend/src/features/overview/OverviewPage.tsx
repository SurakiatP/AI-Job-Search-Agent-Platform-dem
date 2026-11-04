import { useEffect, useState, type ReactNode } from 'react';
import { CountUp } from '@/components/CountUp';
import { APPLIED_ONWARD } from '@/lib/applicationStages';
import type { ApplicationStage } from '@/lib/api-types';
import { GemSparkle } from '@/components/AiMark';
import { ArrowRight, LayoutDashboard, ListChecks, Clock3, Upload, Search, Loader2 } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FitScore } from '@/components/FitScore';
import { StatusBadge } from '@/components/StatusBadge';
import type { ApprovalView, CVView, DocumentView, JobRevisionView, ProjectView, RunView, SessionView } from '@/lib/api-types';
import { ErrorState } from '../projects/PageStates';
import { sendJson, useResource } from '../projects/useResource';
import { EvaluateButton } from '../sessions/EvaluateButton';
import { nextStep, type NextStep } from './nextStep';
import { StartCard } from './StartCard';
import { useOverviewCopy } from './copy';
import { latestEvaluations } from './latestEvaluations';
import { PageHeader } from '@/components/PageHeader';
import { CompanyMark } from '@/components/CompanyMark';


const heroBtn = 'bg-hero-foreground text-hero hover:bg-hero-foreground/90 active:bg-hero-foreground/80 focus-visible:ring-hero-foreground focus-visible:ring-offset-hero';

function ResourcePanel({ resource, children }: { resource: { status: string; reload: () => void; data?: unknown }; children: ReactNode }) {
  const { t } = useTranslation();
  if (resource.status === 'error' && !resource.data) return <ErrorState onRetry={resource.reload} />;
  if (resource.status === 'loading' && !resource.data) return <div role="status" className="grid gap-4 p-5"><span className="sr-only">{t('pages.loading')}</span><Skeleton className="h-14" /><Skeleton className="h-14" /></div>;
  return <>{children}</>;
}

function Section({ id, title, viewAll, className, bare, children }: { bare?: boolean; id: string; title: string; viewAll?: { to: string; label: string }; className?: string; children: ReactNode }) {
  const { t } = useTranslation();
  return <section aria-labelledby={id} className={`grid min-w-0 gap-3 ${className ?? ''}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id={id} className="text-2xl font-semibold tracking-tight">{title}</h2>{viewAll && <Link className="inline-flex min-h-11 items-center text-sm hover:underline lg:min-h-10" to={viewAll.to}>{t('workspace.viewAll')}<span className="sr-only"> {viewAll.label}</span></Link>}</div>
    <div className={bare ? undefined : 'workspace-panel'}>{children}</div>
  </section>;
}

function EmptyLine({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return <div className="grid justify-items-start gap-2 p-5 sm:p-6"><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{body}</p>{children}</div>;
}

function OverviewSkeleton({ label }: { label: string }) {
  return <div role="status" className="grid min-w-0 gap-6 lg:gap-8">
    <span className="sr-only">{label}</span>
    <div className="grid gap-3"><Skeleton className="h-10 w-64 max-w-full" /><Skeleton className="h-5 w-96 max-w-full" /></div>
    <Skeleton className="h-56 rounded-3xl" />
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="grid gap-2 bg-card p-5 sm:p-6"><Skeleton className="h-10 w-12" /><Skeleton className="h-4 w-20" /></div>)}</div>
    <div className="grid gap-3"><Skeleton className="h-8 w-40" /><div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-36 rounded-2xl" /><Skeleton className="h-36 rounded-2xl" /></div></div>
  </div>;
}

export function OverviewPage() {
  const { projectId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const c = useOverviewCopy();
  const locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const base = `/app/projects/${projectId}`;
  const project = useResource<ProjectView>(`/projects/${projectId}`);
  const cvs = useResource<CVView[]>(`/projects/${projectId}/cvs`);
  const jobs = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const documents = useResource<DocumentView[]>(`/projects/${projectId}/documents`);
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
  const approvals = useResource<ApprovalView[]>(`/projects/${projectId}/approvals`);
  const sessions = useResource<SessionView[]>(`/projects/${projectId}/sessions`);
  const [stageBusy, setStageBusy] = useState(false);
  const [stageFailed, setStageFailed] = useState(false);
  const cv = cvs.data?.find(item => item.is_primary) ?? cvs.data?.[0];
  // The CV a one-click evaluation will use (EvaluateButton's pick): the only usable one, else the primary.
  const usable = (cvs.data ?? []).filter(item => item.latest_revision);
  const scoringCv = usable.length === 1 ? usable[0] : usable.find(item => item.is_primary);
  const jobList = jobs.data ?? [];
  const runList = runs.data ?? [];
  const attention = runList.filter(run => run.status === 'needs_input' || run.status === 'waiting_approval');
  const active = runList.filter(run => run.status === 'queued' || run.status === 'running');
  const pending = (approvals.data ?? []).filter(item => !item.consumed_at && !item.decision && Date.parse(item.expires_at) > Date.now());
  const unmatchedApprovals = pending.filter(item => !attention.some(run => run.id === item.run_id));
  const evaluations = latestEvaluations(runList, sessions.data);
  // Runs such as "Read CV" carry no session_id, so they never link to one.
  const runHref = (run: RunView) => run.status === 'waiting_approval' ? `${base}/console?tab=approvals` : run.session_id ? `${base}/sessions/${run.session_id}` : `${base}/console?tab=runs`;
  const opLabel = (run: RunView) => c.ops[run.operation] ?? t(`workspace.operations.${run.operation}`);
  const hasAttention = attention.length > 0 || unmatchedApprovals.length > 0;
  const refreshRuns = runs.reload;
  const refreshApprovals = approvals.reload;
  const hasLiveWork = hasAttention || active.length > 0;
  const recentJobs = [...jobList].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const focus = recentJobs[0];
  const focusSession = focus ? sessions.data?.find(item => item.job_revision_id === focus.id) : undefined;
  const drafted = !!focusSession && (documents.data ?? []).some(doc => doc.source_run_id && runList.some(run => run.id === doc.source_run_id && run.session_id === focusSession.id && run.operation === 'draft_documents'));
  const step: NextStep | null = cvs.data && jobs.data && runs.data ? nextStep({
    hasCv: !!cv?.latest_revision,
    extractionRunning: active.some(run => run.operation === 'extract_experience' || run.operation === 'profile_cv'),
    waitingRunId: attention[0]?.id,
    job: focus ? { id: focus.id, stage: focus.application_status ?? undefined, session: focusSession ? { id: focusSession.id, scored: evaluations.has(focus.id), drafted } : undefined } : undefined,
  }) : null;
  const firstRun = !!step && evaluations.size === 0 && (step.key === 'uploadCv' || step.key === 'readingCv' || step.key === 'findJob');
  // No fit score yet: the three-step start card replaces the single next-step card.
  const startCard = firstRun || (!!step && evaluations.size === 0 && step.key === 'getFitScore');
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') { refreshRuns(); refreshApprovals(); } };
    window.addEventListener('focus', refresh);
    const timer = hasLiveWork ? window.setInterval(refresh, 15000) : undefined;
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, [projectId, hasLiveWork, refreshRuns, refreshApprovals]);
  // A run that leaves the active list changed what it worked on (CV read, score, draft): reload those lists too.
  const activeKey = active.map(run => run.id).sort().join(',');
  const [seenActive, setSeenActive] = useState(activeKey);
  if (seenActive !== activeKey) {
    setSeenActive(activeKey);
    if (seenActive.split(',').some(id => id && !activeKey.split(',').includes(id))) { cvs.reload(); jobs.reload(); sessions.reload(); documents.reload(); }
  }

  async function markApplied() {
    if (!focus || stageBusy) return;
    setStageBusy(true); setStageFailed(false);
    try { await sendJson(`/projects/${projectId}/jobs/${focus.id}/application-status`, 'PATCH', { application_status: 'applied' }); jobs.reload(); }
    catch { setStageFailed(true); } finally { setStageBusy(false); }
  }

  // Exactly one primary control per state; the "reading" state has none and says so.
  function heroAction(s: NextStep, label: string) {
    const a = s.action;
    if (a.type === 'none') return <p role="status" className="inline-flex items-center gap-2 text-sm text-hero-muted"><Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{label}</p>;
    if (a.type === 'pickFile') return <Button asChild className={heroBtn}><Link to={`${base}/profile`}><Upload size={17} aria-hidden="true" />{label}</Link></Button>;
    if (a.type === 'link') return <Button asChild className={heroBtn}><Link to={`${base}/${a.to}`}>{a.to === 'search' && <Search size={17} aria-hidden="true" />}{label}</Link></Button>;
    if (a.type === 'evaluate') return <EvaluateButton projectId={projectId} job={{ savedId: a.jobId }} className={heroBtn}>{label}</EvaluateButton>;
    if (a.type === 'draft') return <Button asChild className={heroBtn}><Link to={`${base}/sessions/${a.sessionId}`}>{label}</Link></Button>;
    if (a.type === 'setStage') return <Button type="button" className={heroBtn} busy={stageBusy} onClick={() => void markApplied()}>{label}</Button>;
    const run = attention.find(item => item.id === a.runId);
    return <Button asChild className={heroBtn}><Link to={run ? runHref(run) : `${base}/console?tab=runs`}>{label}</Link></Button>;
  }

  const stats = jobs.data && runs.data && sessions.data && !firstRun ? [
    { key: 'saved', n: jobList.length },
    { key: 'evaluated', n: evaluations.size },
    { key: 'applied', n: jobList.filter(job => APPLIED_ONWARD.has(job.application_status as ApplicationStage)).length },
    { key: 'interviews', n: jobList.filter(job => ['interview', 'offer', 'hired'].includes(job.application_status ?? '')).length },
  ] as const : null;
  const statRow = stats && <dl aria-label={c.stats.label} className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border shadow-[var(--shadow-soft)] sm:grid-cols-4">
    {stats.map(stat => <div key={stat.key} className="grid min-w-0 content-start gap-1 bg-card p-5 sm:p-6">
      <dt className="order-2 break-words text-sm text-muted-foreground">{c.stats[stat.key]}</dt>
      <dd className="order-1 text-4xl font-semibold tabular-nums tracking-tight"><CountUp value={stat.n} /></dd>
    </div>)}
  </dl>;

  const reloadStart = () => { cvs.reload(); jobs.reload(); runs.reload(); };
  const start = startCard && <StartCard projectId={projectId} cvName={scoringCv?.name ?? cv?.name} hasCv={!!cv?.latest_revision} reading={step?.key === 'readingCv'}
    job={focus ? { id: focus.id, name: [focus.title, focus.company].filter(Boolean).join(' · ') } : undefined} onChanged={reloadStart} />;
  const hero = step && !startCard && (() => {
    const copy = c.hero[step.key];
    const jobName = focus ? [focus.title, focus.company].filter(Boolean).join(' · ') : '';
    return <section aria-labelledby="next-step-heading" className="aurora grid gap-5 rounded-3xl bg-hero p-6 text-hero-foreground shadow-[var(--shadow-lift)] sm:p-8">
      <span className="aurora-glow" aria-hidden="true" />
      <div className="grid gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-hero-accent"><GemSparkle className="size-4" />{c.nextStep}</p>
        <h2 id="next-step-heading" className="break-words text-3xl font-semibold tracking-tight">{copy.title}</h2>
        <p className="max-w-2xl break-words text-hero-muted">{copy.body(jobName, scoringCv?.name)}</p>
      </div>
      <div className="grid justify-items-start gap-2">
        {heroAction(step, copy.title)}
        {stageFailed && <p role="alert" className="text-sm text-hero-foreground underline decoration-destructive decoration-2 underline-offset-4">{c.failed}</p>}
      </div>
    </section>;
  })();

  const jobsSection = <Section id="jobs-heading" bare={jobList.length > 0} title={c.recentJobs} viewAll={{ to: `${base}/applications`, label: t('workspace.applications') }}>
    <ResourcePanel resource={jobs}>{jobList.length === 0
      ? <EmptyLine title={c.noJobs} body={c.noJobsFirst} />
      : <ul className="grid gap-4 sm:grid-cols-2">{recentJobs.slice(0, 4).map(job => {
        const evaluation = evaluations.get(job.id);
        const sid = evaluation?.session_id;
        return <li key={job.id} className="min-w-0"><Link className="group grid h-full min-w-0 content-between gap-4 rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] transition-[box-shadow,transform] duration-200 hover:shadow-[var(--shadow-lift)] motion-safe:hover:-translate-y-0.5" to={sid ? `${base}/sessions/${sid}` : `${base}/jobs/${job.id}`}>
          <div className="flex min-w-0 items-start gap-3">
            <CompanyMark name={job.company} size={48} />
            <div className="min-w-0"><span className="line-clamp-2 break-words font-semibold">{job.title}</span>{job.company && <p className="mt-1 break-words text-sm text-muted-foreground">{job.company}</p>}</div>
          </div>
          <span className="flex flex-wrap items-center gap-2"><StatusBadge status={job.application_status ?? 'saved'} locale={locale} /><FitScore result={evaluation?.evaluation_result} locale={locale} /><ArrowRight size={17} className="ms-auto" aria-hidden="true" /></span>
        </Link></li>;
      })}</ul>}</ResourcePanel>
  </Section>;

  if (project.status === 'error' && !project.data) return <ErrorState onRetry={project.reload} />;
  // First load: one placeholder in the page's final shape, then everything at once. Drawing each list as it arrives
  // made the page jump three times (title, lone job card, hero card pushing it down).
  // Documents and approvals only add detail; without them the page still works.
  const firstLoad = [project, cvs, jobs, runs, sessions];
  if ([...firstLoad, documents, approvals].some(item => item.status === 'loading' && !item.data)) return <OverviewSkeleton label={t('pages.loading')} />;
  if (firstLoad.some(item => item.status === 'error' && !item.data)) return <ErrorState onRetry={() => firstLoad.forEach(item => { if (!item.data) item.reload(); })} />;
  return <div className="grid min-w-0 gap-6 lg:gap-8">
    <PageHeader icon={LayoutDashboard} title={project.data?.name ?? t('nav.overview')} lede={startCard ? c.subtitleFirst : t('workspace.overviewSubtitle')} />

    {start}

    {hero}

    {statRow}

    {(hasAttention || approvals.status === 'error') && <section aria-labelledby="attention-heading" className="grid gap-3 rounded-xl border border-warning/40 bg-card p-5 sm:p-6">
      <div className="flex items-center gap-3"><ListChecks size={21} className="text-warning" aria-hidden="true" /><h2 id="attention-heading" className="text-lg font-semibold">{t('workspace.attention')}</h2>{hasAttention && <Badge variant="warning">{attention.length + unmatchedApprovals.length}</Badge>}</div>
      <ul className="divide-y">{attention.map(run => <li key={run.id}><Link to={runHref(run)} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3">
        <div><span className="font-medium">{opLabel(run)}</span><p className="text-sm text-muted-foreground">{t(run.status === 'needs_input' ? 'workspace.answer' : 'workspace.review')}</p></div><StatusBadge status={run.status} locale={locale} /><ArrowRight size={17} aria-hidden="true" />
      </Link></li>)}{unmatchedApprovals.map(approval => <li key={approval.id}><Link className="flex min-h-14 items-center justify-between gap-3 py-3" to={`${base}/console?tab=approvals`}><span>{t(`workspace.approvalActions.${approval.action}`)}</span><ArrowRight size={17} aria-hidden="true" /></Link></li>)}</ul>
      {approvals.status === 'error' && <ErrorState onRetry={approvals.reload} />}
    </section>}

    {active.length > 0 && <Section id="running-heading" title={c.running}>
      <ul className="divide-y">{active.slice(0, 5).map(run => <li key={run.id}><Link className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5" to={runHref(run)}><span className="flex items-center gap-2 font-medium"><Clock3 size={16} aria-hidden="true" />{opLabel(run)}</span><StatusBadge status={run.status} locale={locale} /></Link></li>)}</ul>
    </Section>}

    {!firstRun && jobsSection}

    <p className="max-w-3xl border-t pt-5 text-xs text-muted-foreground">{t('workspace.manual')}</p>
  </div>;
}
