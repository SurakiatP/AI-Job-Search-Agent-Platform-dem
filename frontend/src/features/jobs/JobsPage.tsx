import { useState } from 'react';
import { useDraft } from '../../app/drafts';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, ExternalLink, FileText, Kanban, Plus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/EmptyState';
import { FitScore, FitScoreWhy } from '@/components/FitScore';
import { PageBack } from '@/components/PageBack';
import { Markdown } from '@/components/Markdown';
import { CompanyMark } from '@/components/CompanyMark';
import { StatusBadge } from '@/components/StatusBadge';
import type { ApplicationStage, ApplicationCardView, CVView, DocumentView, JobRevisionView, Locale, RunView, SessionView, SkillCoverage } from '../../lib/api-types';
import { latestEvaluations } from '../overview/latestEvaluations';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { ApplicationBoard } from '../applications/ApplicationBoard';
import { ACTIVE_STAGES, CLOSED_STAGES } from '../../lib/applicationStages';
import { ApplicationPanel } from '../applications/ApplicationPanel';
import { JobRemoveMenu } from './JobRemoveMenu';
import { NextStepButton, jobFlow } from './NextStepButton';
import { safeHttpUrl, sendJson, useResource } from '../projects/useResource';
import { AiLabel } from '@/components/AiMark';
import { PageHeader } from '@/components/PageHeader';

export function JobsPage() {
  const { t } = useTranslation();
  const { t: appT } = useTranslation('applicationsWorkspace');
  const { projectId = '' } = useParams();
  const base = `/app/projects/${projectId}`;
  const result = useResource<ApplicationCardView[]>(`/projects/${projectId}/applications`);
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
  const sessions = useResource<SessionView[]>(`/projects/${projectId}/sessions`);
  const cvs = useResource<CVView[]>(`/projects/${projectId}/cvs`);
  const [title, setTitle] = useDraft(projectId, 'new-job', 'title');
  const [description, setDescription] = useDraft(projectId, 'new-job', 'description');
  const [company, setCompany] = useDraft(projectId, 'new-job', 'company');
  const [sourceUrl, setSourceUrl] = useDraft(projectId, 'new-job', 'source_url');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'save' | 'source' | 'missing' | null>(null);
  const [open, setOpen] = useState(() => Boolean(title || description || company || sourceUrl));
  if (result.status === 'loading' && !result.data) return <LoadingState />;
  if (result.status === 'error' && !result.data) return <ErrorState onRetry={result.reload} />;
  const jobs = result.data ?? [];
  const showForm = open;
  async function save() {
    if (busy) return;
    if (!title.trim() || !description.trim()) { setError('missing'); return; }
    const safeSource = sourceUrl.trim() ? safeHttpUrl(sourceUrl.trim()) : null;
    if (sourceUrl.trim() && !safeSource) {
      setError('source');
      return;
    }
    setBusy(true); setError(null);
    try {
      await sendJson(`/projects/${projectId}/jobs`, 'POST', {
        title: title.trim(), description, company: company.trim() || null, source_url: safeSource,
      });
      setTitle(''); setCompany(''); setDescription(''); setSourceUrl(''); setOpen(false); result.reload();
    } catch { setError('save'); } finally { setBusy(false); }
  }
  return <section className="grid gap-6 lg:gap-8">
    <div className="grid gap-1">
      <PageHeader icon={Kanban} title={appT('pageTitle')}
        lede={jobs.length > 0 && <>
          <p>{appT('summary', { tracked: jobs.length, active: jobs.filter(job => ACTIVE_STAGES.includes(job.stage)).length, closed: jobs.filter(job => CLOSED_STAGES.includes(job.stage)).length })}</p>
          <p className="mt-1 text-sm">{appT('recordingNote')}</p>
        </>}
        actions={<Button variant={showForm ? 'outline' : 'default'} aria-expanded={showForm} aria-controls="add-job-form" onClick={() => setOpen(value => !value)}>{showForm ? appT('closeForm') : <><Plus className="size-4" aria-hidden="true" />{appT('addPosting')}</>}</Button>} />
    </div>
    {showForm && <Card id="add-job-form">
      <CardHeader><CardTitle>{appT('addPostingTitle')}</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
          <div className="grid gap-2"><div className="mui-field"><Input placeholder=" " id="job-title" value={title} maxLength={300} aria-invalid={error === 'missing' && !title.trim()} aria-describedby={error === 'missing' ? 'job-error' : undefined} onChange={event => { setTitle(event.target.value); if (error === 'missing') setError(null); }} required /><Label htmlFor="job-title" className="mui-label">{t('workflow.jobTitle')}</Label></div></div>
          <div className="grid gap-2"><div className="mui-field"><Input placeholder=" " id="job-company" value={company} maxLength={300} onChange={event => setCompany(event.target.value)} /><Label htmlFor="job-company" className="mui-label">{t('workflow.company')}</Label></div></div>
          <div className="grid gap-2"><div className="mui-field"><Input placeholder=" " id="job-source-url" type="text" inputMode="url" aria-invalid={error === 'source'} value={sourceUrl} maxLength={2048} onChange={event => { setSourceUrl(event.target.value); if (error === 'source') setError(null); }} /><Label htmlFor="job-source-url" className="mui-label">{t('workflow.sourceUrl')}</Label></div></div>
          <div className="grid gap-2"><div className="mui-field"><Textarea placeholder=" " id="job-description" rows={8} maxLength={50000} value={description} aria-invalid={error === 'missing' && !description.trim()} aria-describedby={error === 'missing' ? 'job-error' : undefined} onChange={event => { setDescription(event.target.value); if (error === 'missing') setError(null); }} required /><Label htmlFor="job-description" className="mui-label">{t('workflow.posting')}</Label></div></div>
          {error && <Alert severity="error" id="job-error" role="alert">{appT(error === 'source' ? 'invalidSource' : error === 'missing' ? 'missingFields' : 'savePostingError')}</Alert>}
          <div><Button type="submit" busy={busy} disabled={busy}>{appT('savePosting')}</Button></div>
        </form>
      </CardContent>
    </Card>}
    {!jobs.length && <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6"><p className="font-medium">{appT('empty')}</p><p className="text-sm text-muted-foreground">{appT('emptyNext')}</p><Link className="text-sm text-primary hover:underline" to={`${base}/search`}>{appT('findJobs')}</Link></div>}
    {jobs.length > 0 && <ApplicationBoard projectId={projectId} cards={jobs} onChanged={result.reload} flowData={{ cvs: cvs.data, runs: runs.data, sessions: sessions.data }} />}
  </section>;
}

function SkillsFound({ coverage }: { coverage: SkillCoverage }) {
  const { t } = useTranslation('applicationsWorkspace');
  return <section aria-label={t('skillsFound')} className="grid min-w-0 gap-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold">{t('skillsFound')}</h3>
      <span className="font-semibold tabular-nums">{coverage.matched.length} / {coverage.required.length}</span>
    </div>
    <Progress value={Math.round(coverage.ratio * 100)} />
    {coverage.matched.length > 0 && <ul className="flex flex-wrap gap-1" aria-label={t('skillsFound')}>
      {coverage.matched.map(skill => <li key={skill}><Badge variant="success" className="break-all">{skill}</Badge></li>)}
    </ul>}
    {coverage.missing.length > 0 && <ul className="flex flex-wrap gap-1" aria-label={t('skillsMissing')}>
      {coverage.missing.map(skill => <li key={skill}><Badge variant="muted" className="break-all">{skill}</Badge></li>)}
    </ul>}
    <p className="text-xs text-muted-foreground">{t('skillsNote')}</p>
  </section>;
}

// Posting text is untrusted: Markdown renders it as text. Collapsed to about 8 lines when long.
function JobDescription({ text }: { text: string }) {
  const { t } = useTranslation('applicationsWorkspace');
  const [expanded, setExpanded] = useState(false);
  const long = text.split('\n').length > 8 || text.length > 700;
  return <section aria-labelledby="job-description" className="grid min-w-0 content-start gap-3 rounded-lg border border-border bg-card p-5 sm:p-6 lg:col-start-1">
    <h2 id="job-description" className="text-lg font-semibold">{t('jobDescription')}</h2>
    <div id="job-description-body" className={long && !expanded ? 'max-h-48 overflow-hidden' : undefined}>
      <Markdown data-testid="job-description">{text}</Markdown>
    </div>
    {long && <Button type="button" variant="ghost" size="sm" className="justify-self-start" aria-expanded={expanded} aria-controls="job-description-body" onClick={() => setExpanded(value => !value)}>
      {expanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}{expanded ? t('showLess') : t('showFullDescription')}
    </Button>}
  </section>;
}

export function JobDetailPage() {
  const { t, i18n } = useTranslation('applicationsWorkspace');
  const locale: Locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const { projectId = '', jobId = '' } = useParams();
  const navigate = useNavigate();
  const base = `/app/projects/${projectId}`;
  const result = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
  const documents = useResource<DocumentView[]>(`/projects/${projectId}/documents`);
  const cvs = useResource<CVView[]>(`/projects/${projectId}/cvs`);
  const sessions = useResource<SessionView[]>(`/projects/${projectId}/sessions`);
  const [appliedNote, setAppliedNote] = useState(false);
  const evaluation = latestEvaluations(runs.data ?? [], sessions.data).get(jobId);
  const evaluationSession = useResource<SessionView>(evaluation ? `/projects/${projectId}/sessions/${evaluation.session_id}` : null);
  if (result.status === 'loading' && !result.data) return <LoadingState />;
  if (result.status === 'error') return <ErrorState onRetry={result.reload} />;
  const job = result.data?.find(item => item.id === jobId);
  if (!job) return <EmptyState title={t('removedTitle')} description={t('removedBody')}><Button asChild><Link to={`${base}/applications`}>{t('backToApplications')}</Link></Button></EmptyState>;
  const source = safeHttpUrl(job.source_url);
  const pair = evaluationSession.data;
  const hasExactPair = Boolean(pair?.cv_revision_id && pair.id === evaluation?.session_id && pair.job_revision_id === evaluation?.job_revision_id);
  const jobRuns = (runs.data ?? []).filter(run => run.job_revision_id === job.id);
  const jobRunIds = new Set(jobRuns.map(run => run.id));
  const related = (documents.data ?? []).filter(doc => doc.source_run_id && jobRunIds.has(doc.source_run_id));
  const usableCvs = (cvs.data ?? []).filter(cv => cv.latest_revision);
  const primaryCv = usableCvs.find(cv => cv.is_primary) ?? usableCvs[0];
  const flow = jobFlow({ cvs: cvs.data, runs: runs.data, sessions: sessions.data }, job.id, (job.application_status ?? 'saved') as ApplicationStage);
  async function markApplied() {
    try { await sendJson(`/projects/${projectId}/jobs/${job!.id}/application-status`, 'PATCH', { application_status: 'applied' }); setAppliedNote(true); result.reload(); } catch { /* the stage select in the panel still works */ }
  }
  const score = evaluation?.evaluation_result ?? null;
  const card = 'grid min-w-0 content-start gap-4 rounded-lg border border-border bg-card p-5 sm:p-6';
  return <article className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8 lg:grid-rows-[auto_auto_auto_1fr]">
    <header className="grid min-w-0 gap-3 lg:col-span-2">
      <PageBack to={`${base}/applications`}>{t('back')}</PageBack>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <CompanyMark name={job.company} size={48} />
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold md:text-3xl">{job.title || t('untitled')}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              {job.company && <><span className="break-words">{job.company}</span><span aria-hidden="true">·</span></>}
              <span>{t('revision', { revision: job.revision })}</span>
              {source && <><span aria-hidden="true">·</span><a className="inline-flex min-h-11 lg:min-h-10 items-center gap-1 text-primary hover:underline" href={source} target="_blank" rel="noreferrer">{t('source')}<ExternalLink className="size-4" aria-hidden="true" /></a></>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.application_status ?? 'saved'} locale={locale} />
          <NextStepButton projectId={projectId} jobId={job.id} step={flow.step} waitingSessionId={flow.waitingSessionId} cvName={primaryCv?.name} onApplied={() => void markApplied()} />
          <JobRemoveMenu projectId={projectId} jobId={job.id} title={job.title} onRemoved={() => navigate(`${base}/applications`)} />
        </div>
      </div>
      {appliedNote && <p role="status" className="text-sm text-muted-foreground">{t('appliedNote')}</p>}
    </header>

    <section aria-labelledby="job-evaluation" className={`${card} lg:col-start-1`}>
      <h2 id="job-evaluation" className="text-lg font-semibold">{t('evaluation')}</h2>
      {evaluation?.evaluation_result ? <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FitScore size="lg" result={score} locale={locale} />
          <AiLabel />
          {/* Hidden when the next-step button already opens this session (draft or practise), so one place has one control. */}
          {!(flow.step.action.type === 'draft' || flow.step.action.type === 'link' && flow.step.action.to !== 'search') && <Link className="min-h-11 lg:min-h-10 content-center text-sm text-primary hover:underline" to={`${base}/sessions/${evaluation.session_id}`}>{t('evaluationSession')}</Link>}
        </div>
        <div data-testid="evaluation-provenance" className="flex min-w-0 flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span>{t('revision', { revision: job.revision })}</span>
          <span className="break-words">{hasExactPair && pair?.cv_name && pair.cv_revision != null
            ? t('sourceCV', { name: pair.cv_name, revision: pair.cv_revision })
            : hasExactPair && pair?.cv_revision_id
              ? <>{t('sourceCVId')} <span className="break-all">{pair.cv_revision_id}</span></>
              : t('sourceCVUnavailable')}</span>
          {evaluationSession.status === 'error' && <button type="button" className="min-h-11 lg:min-h-10 text-primary underline underline-offset-4" onClick={evaluationSession.reload}>{t('retry')}</button>}
        </div>
        <FitScoreWhy result={score} locale={locale} />
        {evaluation.evaluation_result.skill_coverage && <SkillsFound coverage={evaluation.evaluation_result.skill_coverage} />}
        <div>
          <h3 className="inline-flex flex-wrap items-center gap-2 font-medium">{t('latestEvaluation')}<AiLabel /></h3>
          <Markdown className="mt-2" data-testid="evaluation-report">{evaluation.evaluation_result.report_markdown}</Markdown>
        </div>
      </> : <div className="flex flex-col items-start gap-2">
        <p className="font-medium">{t('notEvaluated')}</p><p className="text-sm text-muted-foreground">{t('notEvaluatedNext')}</p>
      </div>}
    </section>

    <ApplicationPanel className="lg:sticky lg:top-4 lg:col-start-2 lg:row-span-3 lg:row-start-2 lg:self-start" projectId={projectId} jobId={job.id} jobTitle={job.title} onStageChanged={result.reload} />

    <section aria-labelledby="job-documents" className={`${card} lg:col-start-1`}>
      <h2 id="job-documents" className="text-lg font-semibold">{t('relatedDocuments')}</h2>
      {related.length === 0 ? <div><p className="text-sm">{t('noRelatedDocuments')}</p><p className="text-sm text-muted-foreground">{t('noRelatedDocumentsNext')}</p></div> :
        <ul className="divide-y divide-border">{related.map(doc => <li key={doc.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2 first:pt-0">
          <span className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><Link className="break-words font-medium text-primary hover:underline" to={`${base}/documents/${doc.id}`}>{doc.title}</Link></span>
          {doc.latest_revision && <span className="text-sm text-muted-foreground">{t('documentRevision', { revision: doc.latest_revision.revision })}</span>}
        </li>)}</ul>}
    </section>

    <JobDescription text={job.description ?? ''} />
  </article>;
}
