import { useState } from 'react';
import { useDraft } from '../../app/drafts';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, ExternalLink, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/EmptyState';
import { FitScore, fitBand } from '@/components/FitScore';
import { PageBack } from '@/components/PageBack';
import { Markdown } from '@/components/Markdown';
import { StatusBadge } from '@/components/StatusBadge';
import type { ApplicationCardView, CVView, DocumentView, JobRevisionView, Locale, RunView, SessionView, SkillCoverage } from '../../lib/api-types';
import { latestEvaluations } from '../overview/latestEvaluations';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { ApplicationBoard } from '../applications/ApplicationBoard';
import { ACTIVE_STAGES, CLOSED_STAGES } from '../../lib/applicationStages';
import { ApplicationPanel } from '../applications/ApplicationPanel';
import { JobRemoveMenu } from './JobRemoveMenu';
import { NewSessionButton } from '../sessions/NewSessionDialog';
import { safeHttpUrl, sendJson, useResource } from '../projects/useResource';
import { AiLabel } from '@/components/AiMark';

export function JobsPage() {
  const { t } = useTranslation();
  const { t: appT } = useTranslation('applicationsWorkspace');
  const { projectId = '' } = useParams();
  const base = `/app/projects/${projectId}`;
  const result = useResource<ApplicationCardView[]>(`/projects/${projectId}/applications`);
  const [title, setTitle] = useDraft(projectId, 'new-job', 'title');
  const [description, setDescription] = useDraft(projectId, 'new-job', 'description');
  const [company, setCompany] = useDraft(projectId, 'new-job', 'company');
  const [sourceUrl, setSourceUrl] = useDraft(projectId, 'new-job', 'source_url');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'save' | 'source' | null>(null);
  const [open, setOpen] = useState(() => Boolean(title || description || company || sourceUrl));
  if (result.status === 'loading' && !result.data) return <LoadingState />;
  if (result.status === 'error' && !result.data) return <ErrorState onRetry={result.reload} />;
  const jobs = result.data ?? [];
  const showForm = open;
  async function save() {
    if (busy || !title.trim() || !description.trim()) return;
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
  return <section className="grid gap-6">
    <PageBack to={`/app/projects/${projectId}/overview`}>{t('nav.overview')}</PageBack>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold">{appT('pageTitle')}</h1>
        {jobs.length > 0 && <p className="mt-1 text-base text-muted-foreground">{appT('summary', { tracked: jobs.length, active: jobs.filter(job => ACTIVE_STAGES.includes(job.stage)).length, closed: jobs.filter(job => CLOSED_STAGES.includes(job.stage)).length })}</p>}
        {jobs.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{appT('recordingNote')}</p>}
      </div>
      <Button aria-expanded={showForm} aria-controls="add-job-form" onClick={() => setOpen(value => !value)}>{showForm ? appT('closeForm') : <><Plus className="size-4" aria-hidden="true" />{appT('addPosting')}</>}</Button>
    </div>
    {showForm && <Card id="add-job-form">
      <CardHeader><CardTitle>{appT('addPostingTitle')}</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
          <div className="grid gap-2"><Label htmlFor="job-title">{t('workflow.jobTitle')}</Label><Input id="job-title" value={title} maxLength={300} onChange={event => setTitle(event.target.value)} required /></div>
          <div className="grid gap-2"><Label htmlFor="job-company">{t('workflow.company')}</Label><Input id="job-company" value={company} maxLength={300} onChange={event => setCompany(event.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor="job-source-url">{t('workflow.sourceUrl')}</Label><Input id="job-source-url" type="text" inputMode="url" aria-invalid={error === 'source'} value={sourceUrl} maxLength={2048} onChange={event => { setSourceUrl(event.target.value); if (error === 'source') setError(null); }} /></div>
          <div className="grid gap-2"><Label htmlFor="job-description">{t('workflow.posting')}</Label><Textarea id="job-description" rows={8} maxLength={50000} value={description} onChange={event => setDescription(event.target.value)} required /></div>
          {error && <p role="alert" className="text-sm text-destructive">{appT(error === 'source' ? 'invalidSource' : 'savePostingError')}</p>}
          <div><Button type="submit" busy={busy} disabled={busy}>{appT('savePosting')}</Button></div>
        </form>
      </CardContent>
    </Card>}
    {!jobs.length && <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6"><p className="font-medium">{appT('empty')}</p><p className="text-sm text-muted-foreground">{appT('emptyNext')}</p><Link className="text-sm text-primary hover:underline" to={`${base}/search`}>{appT('findJobs')}</Link></div>}
    {jobs.length > 0 && <ApplicationBoard projectId={projectId} cards={jobs} onChanged={result.reload} />}
  </section>;
}

const bandView = { success: { variant: 'success', key: 'fitBandStrong' }, warning: { variant: 'warning', key: 'fitBandPossible' }, danger: { variant: 'danger', key: 'fitBandWeak' } } as const;

function SkillsFound({ coverage }: { coverage: SkillCoverage }) {
  const { t } = useTranslation('applicationsWorkspace');
  return <section aria-label={t('skillsFound')} className="grid min-w-0 gap-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold">{t('skillsFound')}</h3>
      <span className="font-semibold tabular-nums">{coverage.matched.length} / {coverage.required.length}</span>
    </div>
    <Progress value={Math.round(coverage.ratio * 100)} />
    {coverage.matched.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label={t('skillsFound')}>
      {coverage.matched.map(skill => <li key={skill}><Badge variant="success" className="break-all">{skill}</Badge></li>)}
    </ul>}
    {coverage.missing.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label={t('skillsMissing')}>
      {coverage.missing.map(skill => <li key={skill}><Badge variant="outline" className="break-all">{skill}</Badge></li>)}
    </ul>}
    <p className="text-xs text-muted-foreground">{t('skillsNote')}</p>
  </section>;
}

// Posting text is untrusted: Markdown renders it as text. Collapsed to about 8 lines when long.
function JobDescription({ text }: { text: string }) {
  const { t } = useTranslation('applicationsWorkspace');
  const [expanded, setExpanded] = useState(false);
  const long = text.split('\n').length > 8 || text.length > 700;
  return <section aria-labelledby="job-description" className="grid min-w-0 content-start gap-3 lg:col-start-1">
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
  // The primary button follows the real destination: an existing session, else the dialog that creates one.
  const sessionId = [...jobRuns].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.session_id;
  const usableCvs = (cvs.data ?? []).filter(cv => cv.latest_revision);
  const primaryCv = usableCvs.find(cv => cv.is_primary) ?? usableCvs[0];
  const score = evaluation?.evaluation_result?.score ?? null;
  const band = bandView[fitBand(score) as keyof typeof bandView];
  return <article className="grid min-w-0 gap-x-8 gap-y-7 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] lg:grid-rows-[auto_auto_auto_1fr]">
    <header className="grid min-w-0 gap-3 border-b border-border pb-5 lg:col-span-2">
      <PageBack to={`${base}/applications`}>{t('back')}</PageBack>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold">{job.title || t('untitled')}</h1>
          {job.company && <p className="mt-1 break-words text-base text-muted-foreground">{job.company}</p>}
          <p className="mt-1 text-sm text-muted-foreground">{t('revision', { revision: job.revision })}</p>
          {source && <a className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm text-primary hover:underline" href={source} target="_blank" rel="noreferrer">{t('source')}<ExternalLink className="size-4" aria-hidden="true" /></a>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.application_status ?? 'saved'} locale={locale} />
          {sessionId
            ? <Button asChild><Link to={`${base}/sessions/${sessionId}`}>{t('continuePrep')}</Link></Button>
            : <NewSessionButton projectId={projectId} job={{ savedId: job.id }}>{t('prepareDocs')}</NewSessionButton>}
          <JobRemoveMenu projectId={projectId} jobId={job.id} title={job.title} onRemoved={() => navigate(`${base}/applications`)} />
        </div>
      </div>
    </header>

    <section aria-labelledby="job-evaluation" className="grid min-w-0 content-start gap-4 border-b border-border pb-6 lg:col-start-1">
      <h2 id="job-evaluation" className="text-lg font-semibold">{t('evaluation')}</h2>
      {evaluation?.evaluation_result ? <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FitScore size="lg" score={score} locale={locale} />
          {band && <Badge variant={band.variant}>{t(band.key)}</Badge>}
          <Link className="min-h-10 content-center text-sm text-primary hover:underline" to={`${base}/sessions/${evaluation.session_id}`}>{t('evaluationSession')}</Link>
        </div>
        <div data-testid="evaluation-provenance" className="flex min-w-0 flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span>{t('revision', { revision: job.revision })}</span>
          <span className="break-words">{hasExactPair && pair?.cv_name && pair.cv_revision != null
            ? t('sourceCV', { name: pair.cv_name, revision: pair.cv_revision })
            : hasExactPair && pair?.cv_revision_id
              ? <>{t('sourceCVId')} <span className="break-all">{pair.cv_revision_id}</span></>
              : t('sourceCVUnavailable')}</span>
          {evaluationSession.status === 'error' && <button type="button" className="min-h-10 text-primary underline underline-offset-4" onClick={evaluationSession.reload}>{t('retry')}</button>}
        </div>
        {evaluation.evaluation_result.skill_coverage && <SkillsFound coverage={evaluation.evaluation_result.skill_coverage} />}
        <details open>
          <summary className="min-h-10 cursor-pointer content-center font-medium"><span className="inline-flex flex-wrap items-center gap-2">{t('latestEvaluation')}<AiLabel /></span></summary>
          <Markdown className="mt-2" data-testid="evaluation-report">{evaluation.evaluation_result.report_markdown}</Markdown>
        </details>
      </> : <div className="flex flex-col items-start gap-2">
        <p className="font-medium">{t('notEvaluated')}</p><p className="text-sm text-muted-foreground">{t('notEvaluatedNext')}</p>
        <NewSessionButton variant="outline" projectId={projectId} cvName={primaryCv?.name} job={{ savedId: job.id }}>{primaryCv ? t('evaluateWith', { cv: primaryCv.name }) : t('evaluate')}</NewSessionButton>
      </div>}
    </section>

    <ApplicationPanel className="border-b border-border pb-6 lg:col-start-2 lg:row-span-3 lg:row-start-2 lg:border-b-0 lg:border-s lg:pb-0 lg:ps-8" projectId={projectId} jobId={job.id} jobTitle={job.title} onStageChanged={result.reload} />

    <section aria-labelledby="job-documents" className="grid min-w-0 content-start gap-3 border-b border-border pb-6 lg:col-start-1">
      <h2 id="job-documents" className="text-lg font-semibold">{t('relatedDocuments')}</h2>
      {related.length === 0 ? <div><p className="text-sm">{t('noRelatedDocuments')}</p><p className="text-sm text-muted-foreground">{t('noRelatedDocumentsNext')}</p></div> :
        <ul className="grid gap-2">{related.map(doc => <li key={doc.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-b-0">
          <Link className="break-words font-medium text-primary hover:underline" to={`${base}/documents/${doc.id}`}>{doc.title}</Link>
          {doc.latest_revision && <span className="text-sm text-muted-foreground">{t('documentRevision', { revision: doc.latest_revision.revision })}</span>}
        </li>)}</ul>}
      <Link className="min-h-10 content-center text-sm text-primary hover:underline" to={`${base}/documents`}>{t('allDocuments')}</Link>
    </section>

    <JobDescription text={job.description ?? ''} />
  </article>;
}
