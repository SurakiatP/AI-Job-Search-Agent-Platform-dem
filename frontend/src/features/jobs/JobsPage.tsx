import { useCallback, useState } from 'react';
import { useDraft } from '../../app/drafts';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronUp, ExternalLink, Kanban, Plus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/EmptyState';
import { PageBack } from '@/components/PageBack';
import { Markdown } from '@/components/Markdown';
import { CompanyMark } from '@/components/CompanyMark';
import { StatusBadge } from '@/components/StatusBadge';
import type { ApplicationStage, ApplicationCardView, CVView, DocumentView, JobRevisionView, Locale, RunView, SessionView } from '../../lib/api-types';
import { latestEvaluations } from '../overview/latestEvaluations';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { ApplicationBoard } from '../applications/ApplicationBoard';
import { cn } from '@/lib/utils';
import { ACTIVE_STAGES, APPLIED_ONWARD, CLOSED_STAGES } from '../../lib/applicationStages';
import { ApplicationPanel } from '../applications/ApplicationPanel';
import { JobRemoveMenu } from './JobRemoveMenu';
import { NextStepButton, jobFlow } from './NextStepButton';
import { safeHttpUrl, sendJson, useResource } from '../projects/useResource';
import { PageHeader } from '@/components/PageHeader';
import { SessionWorkspace } from '../chat/SessionPage';
import { DocumentSheet } from './DocumentSheet';

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
    {!jobs.length && <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed p-6"><p className="font-medium">{appT('empty')}</p><p className="text-sm text-muted-foreground">{appT('emptyNext')}</p><Link className="text-sm text-primary hover:underline" to={`${base}/search`}>{appT('findJobs')}</Link></div>}
    {jobs.length > 0 && <ApplicationBoard projectId={projectId} cards={jobs} onChanged={result.reload} flowData={{ cvs: cvs.data, runs: runs.data, sessions: sessions.data }} />}
  </section>;
}

// Posting text is untrusted: Markdown renders it as text. Collapsed to about 8 lines when long.
function JobDescription({ text }: { text: string }) {
  const { t } = useTranslation('applicationsWorkspace');
  const [expanded, setExpanded] = useState(false);
  const long = text.split('\n').length > 8 || text.length > 700;
  return <section aria-labelledby="job-description" className="grid min-w-0 content-start gap-3 rounded-lg border border-border bg-card p-5 sm:p-6 ">
    <h2 id="job-description" className="text-lg font-semibold">{t('jobDescription')}</h2>
    <div id="job-description-body" className={long && !expanded ? 'max-h-48 overflow-hidden' : undefined}>
      <Markdown data-testid="job-description">{text}</Markdown>
    </div>
    {long && <Button type="button" variant="ghost" size="sm" className="justify-self-start" aria-expanded={expanded} aria-controls="job-description-body" onClick={() => setExpanded(value => !value)}>
      {expanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}{expanded ? t('showLess') : t('showFullDescription')}
    </Button>}
  </section>;
}

const PROGRESS = ['evaluate', 'documents', 'apply', 'interview'] as const;

// Where this job stands, from data the page already loads. Not a control: the next step lives in the header button.
function JobProgress({ scored, drafted, stage }: { scored: boolean; drafted: boolean; stage: ApplicationStage }) {
  const { t } = useTranslation('applicationsWorkspace');
  const done = [scored, drafted, APPLIED_ONWARD.has(stage), stage === 'offer' || stage === 'hired'];
  const closed = CLOSED_STAGES.includes(stage);
  const current = closed ? -1 : stage === 'interview' ? 3 : done.indexOf(false);
  return <ol aria-label={t('progress.label')} data-testid="job-progress" className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-sm">
    {PROGRESS.map((key, index) => <li key={key} aria-current={index === current ? 'step' : undefined} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1', done[index] ? 'border-success/40 text-success' : index === current ? 'border-primary bg-accent font-semibold text-foreground' : 'text-muted-foreground')}>
      {done[index] ? <Check className="size-3.5" aria-hidden="true" /> : <span aria-hidden="true" className="tabular-nums">{index + 1}</span>}
      {t(`progress.${key}`)}<span className="sr-only">{done[index] ? t('progress.done') : index === current ? t('progress.current') : ''}</span>
    </li>)}
  </ol>;
}

export function JobDetailPage() {
  const { t, i18n } = useTranslation('applicationsWorkspace');
  const locale: Locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const { projectId = '', jobId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const base = `/app/projects/${projectId}`;
  const result = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
  const cvs = useResource<CVView[]>(`/projects/${projectId}/cvs`);
  const sessions = useResource<SessionView[]>(`/projects/${projectId}/sessions`);
  const [appliedNote, setAppliedNote] = useState(false);
  const [opened, setOpened] = useState<DocumentView | null>(null);
  const { reload: reloadRuns } = runs; const { reload: reloadSessions } = sessions;
  const settled = useCallback(() => { reloadRuns(); reloadSessions(); }, [reloadRuns, reloadSessions]);
  // Wait for all four lists: with only the job loaded the page would claim "not evaluated" and pick a wrong next step.
  const needed = [result, runs, cvs, sessions];
  if (needed.some(item => item.status === 'loading' && !item.data)) return <LoadingState />;
  if (needed.some(item => item.status === 'error' && !item.data)) return <ErrorState onRetry={() => needed.forEach(item => item.reload())} />;
  const job = result.data?.find(item => item.id === jobId);
  if (!job) return <EmptyState title={t('removedTitle')} description={t('removedBody')}><Button asChild><Link to={`${base}/applications`}>{t('backToApplications')}</Link></Button></EmptyState>;
  const source = safeHttpUrl(job.source_url);
  const stage = (job.application_status ?? 'saved') as ApplicationStage;
  const evaluation = latestEvaluations(runs.data ?? [], sessions.data).get(job.id);
  const jobRuns = (runs.data ?? []).filter(run => run.job_revision_id === job.id);
  const usableCvs = (cvs.data ?? []).filter(cv => cv.latest_revision);
  const primaryCv = usableCvs.find(cv => cv.is_primary) ?? usableCvs[0];
  const flow = jobFlow({ cvs: cvs.data, runs: runs.data, sessions: sessions.data }, job.id, stage);
  // CH-05: ?session= wins, then the session that holds the latest evaluation, then the newest session of this job.
  const ofJob = (sessions.data ?? []).filter(session => session.job_revision_id === job.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const sessionId = params.get('session') || evaluation?.session_id || ofJob[0]?.id || '';
  const drafted = jobRuns.some(run => run.operation === 'draft_documents' && run.status === 'completed');
  async function markApplied() {
    try { await sendJson(`/projects/${projectId}/jobs/${job!.id}/application-status`, 'PATCH', { application_status: 'applied' }); setAppliedNote(true); result.reload(); } catch { /* the stage select in the panel still works */ }
  }
  const card = 'grid min-w-0 content-start gap-4 rounded-lg border border-border bg-card p-5 sm:p-6';
  return <article className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8">
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
          {/* With a workspace on the page its run strip already holds the one next-step button; a second one would only duplicate it or reload this page. */}
          {!sessionId && <NextStepButton projectId={projectId} jobId={job.id} step={flow.step} waitingSessionId={flow.waitingSessionId} cvName={primaryCv?.name} onApplied={() => void markApplied()} />}
          <JobRemoveMenu projectId={projectId} jobId={job.id} title={job.title} onRemoved={() => navigate(`${base}/applications`)} />
        </div>
      </div>
      <JobProgress scored={Boolean(evaluation)} drafted={drafted} stage={stage} />
      {appliedNote && <p role="status" className="text-sm text-muted-foreground">{t('appliedNote')}</p>}
    </header>

    <div className="grid min-w-0 gap-6">
      {sessionId
        ? <SessionWorkspace key={sessionId} projectId={projectId} sessionId={sessionId} embedded defaultTab={stage === 'interview' ? 'practice' : undefined} onOpenDocument={setOpened} onRunSettled={settled} />
        : <section aria-labelledby="job-evaluation" className={card}>
          <h2 id="job-evaluation" className="text-lg font-semibold">{t('evaluation')}</h2>
          <div className="flex flex-col items-start gap-2"><p className="font-medium">{t('notEvaluated')}</p><p className="text-sm text-muted-foreground">{t('notEvaluatedNext')}</p></div>
        </section>}

      <JobDescription text={job.description ?? ''} />
    </div>

    <ApplicationPanel className="lg:sticky lg:top-4 lg:col-start-2 lg:row-start-2 lg:self-start" projectId={projectId} jobId={job.id} jobTitle={job.title} onStageChanged={result.reload} />
    <DocumentSheet projectId={projectId} doc={opened} onClose={() => setOpened(null)} />
  </article>;
}
