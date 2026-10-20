import { useEffect, type ReactNode } from 'react';
import { ArrowRight, FileText, ListChecks, Search, CheckCircle2, Clock3 } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CvPreviewButton } from '@/components/CvPreview';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FitScore } from '@/components/FitScore';
import { SkillCount } from '@/components/SkillCoverage';
import { StatusBadge } from '@/components/StatusBadge';
import type { ApprovalView, CVView, DocumentView, JobRevisionView, ProjectView, RunView, SessionView } from '@/lib/api-types';
import { ErrorState } from '../projects/PageStates';
import { NewSessionButton } from '../sessions/NewSessionDialog';
import { useResource } from '../projects/useResource';
import { JobRemoveMenu } from '../jobs/JobRemoveMenu';
import { useOverviewCopy } from './copy';
import { GettingStarted, HelpPanel } from './GettingStarted';
import { JourneyStrip } from './JourneyStrip';
import { latestEvaluations } from './latestEvaluations';
import { AiLabel } from '@/components/AiMark';

function ResourcePanel({ resource, children }: { resource: { status: string; reload: () => void; data?: unknown }; children: ReactNode }) {
  const { t } = useTranslation();
  if (resource.status === 'error') return <ErrorState onRetry={resource.reload} />;
  if (resource.status === 'loading' && !resource.data) return <div role="status" className="grid gap-4 p-5"><span className="sr-only">{t('pages.loading')}</span><Skeleton className="h-14" /><Skeleton className="h-14" /></div>;
  return <>{children}</>;
}

function Section({ id, title, viewAll, className, children }: { id: string; title: string; viewAll?: { to: string; label: string }; className?: string; children: ReactNode }) {
  const { t } = useTranslation();
  return <section aria-labelledby={id} className={`min-w-0 ${className ?? ''}`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id={id} className="text-xl font-semibold">{title}</h2>{viewAll && <Link className="text-sm hover:underline" to={viewAll.to}>{t('workspace.viewAll')}<span className="sr-only"> {viewAll.label}</span></Link>}</div>
    <div className="workspace-panel">{children}</div>
  </section>;
}

function EmptyLine({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return <div className="grid justify-items-start gap-2 p-5 sm:p-6"><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{body}</p>{children}</div>;
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
  const cv = cvs.data?.find(item => item.is_primary) ?? cvs.data?.[0];
  const revision = cv?.latest_revision;
  const jobList = jobs.data ?? [];
  const docList = documents.data ?? [];
  const runList = runs.data ?? [];
  const attention = runList.filter(run => run.status === 'needs_input' || run.status === 'waiting_approval');
  const active = runList.filter(run => run.status === 'queued' || run.status === 'running');
  const pending = (approvals.data ?? []).filter(item => !item.consumed_at && !item.decision && Date.parse(item.expires_at) > Date.now());
  const unmatchedApprovals = pending.filter(item => !attention.some(run => run.id === item.run_id));
  const evaluations = latestEvaluations(runList, sessions.data);
  const recent = [...evaluations.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const runHref = (run: RunView) => run.session_id ? `${base}/sessions/${run.session_id}` : `${base}/console?tab=runs`;
  const hasAttention = attention.length > 0 || unmatchedApprovals.length > 0;
  const refreshRuns = runs.reload;
  const refreshApprovals = approvals.reload;
  const hasLiveWork = hasAttention || active.length > 0;
  // First-run only when the answers are known; while a resource is loading or failed, each section shows its own state.
  const firstRun = !!cvs.data && !!jobs.data && !!runs.data && evaluations.size === 0 && (!revision || jobList.length === 0);
  const savedFirst = [...jobList].sort((a, b) => Number((a.application_status ?? 'saved') === 'saved') - Number((b.application_status ?? 'saved') === 'saved'));
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') { refreshRuns(); refreshApprovals(); } };
    window.addEventListener('focus', refresh);
    const timer = hasLiveWork ? window.setInterval(refresh, 15000) : undefined;
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, [projectId, hasLiveWork, refreshRuns, refreshApprovals]);

  const jobsSection = <Section id="jobs-heading" title={c.jobs} viewAll={{ to: `${base}/applications`, label: t('workspace.applications') }}>
    <ResourcePanel resource={jobs}>{jobList.length === 0
      ? <EmptyLine title={c.noJobs} body={c.noJobsFirst}><Button asChild variant="outline"><Link to={`${base}/applications`}>{t('workspace.addJob')}</Link></Button></EmptyLine>
      : <ul className="divide-y">{savedFirst.slice(0, 6).map(job => {
        const evaluation = evaluations.get(job.id);
        return <li key={job.id} className="min-w-0 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link className="break-words text-base font-semibold text-foreground hover:text-primary hover:underline" to={`${base}/jobs/${job.id}`}>{job.title}</Link>{job.company && <p className="mt-1 break-words text-sm text-muted-foreground">{job.company}</p>}</div><StatusBadge status={job.application_status ?? 'saved'} locale={locale} /></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {evaluation?.session_id ? <Link className="inline-flex min-h-10 items-center gap-2 text-sm font-medium hover:underline" to={`${base}/sessions/${evaluation.session_id}`}>{t('workspace.viewEvaluation')}<ArrowRight size={15} aria-hidden="true" /></Link> :
              <NewSessionButton size="sm" variant="outline" projectId={projectId} job={{ savedId: job.id }}>{t('workspace.newEvaluation')}</NewSessionButton>}
            <JobRemoveMenu reveal projectId={projectId} jobId={job.id} title={job.title} onRemoved={jobs.reload} />
          </div>
        </li>;
      })}</ul>}</ResourcePanel>
  </Section>;

  const documentsSection = <Section id="documents-heading" title={t('workspace.docs')} viewAll={{ to: `${base}/documents`, label: t('workspace.documents') }}>
    <ResourcePanel resource={documents}>{docList.length === 0
      ? <EmptyLine title={t('workspace.noDocs')} body={t('workspace.noDocsBody')} />
      : <ul className="divide-y">{docList.slice(0, 4).map(doc => <li key={doc.id} className="flex items-start gap-3 p-5"><FileText size={20} className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="min-w-0 flex-1"><Link className="break-words font-medium hover:underline" to={`${base}/documents/${doc.id}`}>{doc.title}</Link><p className="mt-1 text-sm text-muted-foreground">{doc.latest_revision ? `${t('workspace.revision')} ${doc.latest_revision.revision}` : '—'}</p></div>{doc.partial && <Badge variant="warning">{t('workspace.partial')}</Badge>}</li>)}</ul>}</ResourcePanel>
  </Section>;

  return <div className="grid min-w-0 gap-8">
    <header className="workspace-page-header">
      <div className="min-w-0"><h1>{project.data?.name ?? t('nav.overview')}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{firstRun ? c.subtitleFirst : t('workspace.overviewSubtitle')}</p></div>
      {!firstRun && <Button asChild variant="outline"><Link to={`${base}/search`}><Search size={17} aria-hidden="true" />{t('workspace.findJobs')}</Link></Button>}
    </header>

    <JourneyStrip base={base} />

    {(hasAttention || approvals.status === 'error') && <section aria-labelledby="attention-heading" className="rounded-xl border border-warning/40 bg-card p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-3"><ListChecks size={21} className="text-warning" aria-hidden="true" /><h2 id="attention-heading" className="text-lg font-semibold">{t('workspace.attention')}</h2>{hasAttention && <Badge variant="warning">{attention.length + unmatchedApprovals.length}</Badge>}</div>
      <ul className="divide-y">{attention.map(run => <li key={run.id}><Link to={runHref(run)} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3">
        <div><span className="font-medium">{t(`workspace.operations.${run.operation}`)}</span><p className="text-sm text-muted-foreground">{t(run.status === 'needs_input' ? 'workspace.answer' : 'workspace.review')}</p></div><StatusBadge status={run.status} locale={locale} /><ArrowRight size={17} aria-hidden="true" />
      </Link></li>)}{unmatchedApprovals.map(approval => <li key={approval.id}><Link className="flex min-h-14 items-center justify-between gap-3 py-3" to={`${base}/console?tab=approvals`}><span>{t(`workspace.approvalActions.${approval.action}`)}</span><ArrowRight size={17} aria-hidden="true" /></Link></li>)}</ul>
      {approvals.status === 'error' && <ErrorState onRetry={approvals.reload} />}
    </section>}

    {active.length > 0 && <Section id="running-heading" title={c.running}>
      <ul className="divide-y">{active.slice(0, 5).map(run => <li key={run.id}><Link className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm" to={runHref(run)}><span className="flex items-center gap-2 font-medium"><Clock3 size={16} aria-hidden="true" />{t(`workspace.operations.${run.operation}`)}</span><StatusBadge status={run.status} locale={locale} /></Link></li>)}</ul>
    </Section>}

    {firstRun ? <>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <GettingStarted base={base} cv={revision && cv ? { name: cv.name, version: revision.revision } : null} job={jobList[0] ? { title: jobList[0].title, more: jobList.length - 1 } : null} />
        <HelpPanel hasCv={!!revision} />
      </div>
      <Section id="evaluations-heading" title={c.evaluations}><EmptyLine title={c.noEvaluations} body={c.noEvaluationsFirst} /></Section>
      {jobsSection}
      {(documents.status === 'error' || docList.length > 0) && documentsSection}
    </> : <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
      <div className="grid min-w-0 content-start gap-8">
        <Section id="evaluations-heading" title={c.recentEvaluations} viewAll={{ to: `${base}/sessions`, label: c.evaluations }}>
          <ResourcePanel resource={runs}>{recent.length === 0 ? <EmptyLine title={c.noEvaluations} body={c.noEvaluationsReturning} /> :
            <ul className="divide-y">{recent.map(run => {
              const job = jobList.find(item => item.id === run.job_revision_id);
              const pair = sessions.data?.find(item => item.id === run.session_id);
              return <li key={run.id}><Link className="flex min-h-14 flex-wrap items-center justify-between gap-3 p-5" to={runHref(run)}>
                <div className="min-w-0"><span className="break-words font-semibold">{job?.title ?? pair?.job_title ?? t(`workspace.operations.${run.operation}`)}</span>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">{job?.company && <span>{job.company}</span>}{pair?.cv_name && pair.cv_revision != null && <span className="inline-flex min-w-0 items-center gap-1 text-foreground/80"><FileText size={14} className="shrink-0" aria-hidden="true" /><span className="break-words">{c.usedCv(pair.cv_name, pair.cv_revision)}</span></span>}<SkillCount coverage={run.evaluation_result?.skill_coverage} locale={locale} /></p></div>
                <span className="flex items-center gap-3">{run.evaluation_result?.score != null && <AiLabel className="max-sm:hidden" />}<FitScore score={run.evaluation_result?.score ?? null} locale={locale} /><ArrowRight size={17} aria-hidden="true" /></span>
              </Link></li>;
            })}</ul>}</ResourcePanel>
        </Section>
        {jobsSection}
      </div>
      <div className="grid min-w-0 content-start gap-8">
        <Section id="cv-heading" title={t('workspace.cvTitle')}>
          <div className="p-5"><ResourcePanel resource={cvs}>{revision && cv ? <div className="grid min-w-0 gap-4">
            <div className="flex items-start gap-3"><FileText size={23} className="mt-1 shrink-0 text-primary" aria-hidden="true" /><div className="min-w-0"><p className="break-words font-semibold">{cv.name}</p><p className="text-sm text-muted-foreground">{c.version(revision.revision)}</p></div></div>
            <p className="break-words text-sm text-muted-foreground">{revision.original_filename}</p>
            <p className="flex items-start gap-2 text-sm"><CheckCircle2 size={17} className="mt-1 shrink-0 text-success" aria-hidden="true" />{t(revision.skill_profile_ready ? 'workspace.cvReady' : 'workspace.cvUploaded')}</p>
            {revision.skill_profile_ready === false && <p className="text-sm text-muted-foreground">{t('workspace.cvPending')}</p>}
            <CvPreviewButton projectId={projectId} fileId={revision.file_id} name={cv.name} revision={revision.revision} filename={revision.original_filename} mimeType={revision.mime_type} />
            <Link className="inline-flex min-h-10 items-center gap-2 text-sm font-medium hover:underline" to={`${base}/profile`}>{t('workspace.manageCv')}<ArrowRight size={15} aria-hidden="true" /></Link>
          </div> : <div className="grid justify-items-start gap-3"><p className="text-sm text-muted-foreground">{t('workspace.chooseCv')}</p><Button asChild variant="outline"><Link to={`${base}/profile`}>{t('workspace.addCv')}</Link></Button></div>}</ResourcePanel></div>
        </Section>
        {documentsSection}
      </div>
    </div>}

    {!firstRun && <p className="max-w-3xl border-t pt-5 text-xs text-muted-foreground">{t('workspace.manual')}</p>}
  </div>;
}
