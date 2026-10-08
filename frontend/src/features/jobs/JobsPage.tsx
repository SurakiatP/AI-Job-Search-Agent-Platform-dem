import { useEffect, useState } from 'react';
import { useDraft } from '../../app/drafts';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FitScore } from '@/components/FitScore';
import { SkillCoverage } from '@/components/SkillCoverage';
import { PageBack } from '@/components/PageBack';
import { Markdown } from '@/components/Markdown';
import { StatusBadge } from '@/components/StatusBadge';
import type { DocumentView, JobApplicationStatusView, JobRevisionView, RunView, SessionView } from '../../lib/api-types';
import { latestEvaluations } from '../overview/latestEvaluations';
import { ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { JobRemoveMenu } from './JobRemoveMenu';
import { safeHttpUrl, sendJson, useResource } from '../projects/useResource';

const copy = {
  th: {
    addJob: 'เพิ่มงาน', close: 'ปิดฟอร์ม', noJobs: 'ยังไม่มีงานที่บันทึก', noJobsNext: 'กด "เพิ่มงาน" เพื่อวางประกาศงานแรกของคุณ',
    back: 'งานที่บันทึก', evalSession: 'เปิดเซสชันที่ประเมินงานนี้', report: 'รายงานการประเมินล่าสุด', notEvaluated: 'ยังไม่ได้ประเมินงานนี้', notEvaluatedNext: 'เปิดเซสชันเพื่อให้เอเจนต์ประเมินความเหมาะสมของงานนี้',
    evaluate: 'ประเมินงานนี้', description: 'รายละเอียดงาน', fit: 'ความเหมาะสม', status: 'สถานะการสมัคร', documents: 'เอกสารที่เกี่ยวข้อง',
    noDocs: 'ยังไม่มีเอกสารที่เชื่อมกับงานนี้', allDocs: 'ดูเอกสารทั้งหมด', draft: 'ร่างเอกสารสำหรับงานนี้', revision: 'ฉบับที่', untitled: 'งานไม่มีชื่อ',
  },
  en: {
    addJob: 'Add job', close: 'Close form', noJobs: 'No saved jobs yet', noJobsNext: 'Press "Add job" to paste your first posting.',
    back: 'Saved jobs', evalSession: 'Open the evaluation session', report: 'Latest evaluation report', notEvaluated: 'Not evaluated yet', notEvaluatedNext: 'Open a session so the agent can assess how well this job fits you.',
    evaluate: 'Evaluate this job', description: 'Job description', fit: 'Fit score', status: 'Application status', documents: 'Related documents',
    noDocs: 'No documents are linked to this job yet', allDocs: 'View all documents', draft: 'Draft documents for this job', revision: 'Revision', untitled: 'Untitled job',
  },
};

function useUiLocale(): 'th' | 'en' {
  const { i18n } = useTranslation();
  return i18n.language.startsWith('th') ? 'th' : 'en';
}

function ApplicationStatusControl({ projectId, job, reload, compact = false }: {
  projectId: string;
  job: JobRevisionView;
  reload: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'saved' | 'applied'>(job.application_status ?? 'saved');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => setStatus(job.application_status ?? 'saved'), [job.application_status]);

  async function updateStatus() {
    if (busy) return;
    const application_status = status === 'saved' ? 'applied' : 'saved';
    setBusy(true);
    setError(false);
    try {
      const result = await sendJson<JobApplicationStatusView>(
        `/projects/${projectId}/jobs/${job.id}/application-status`,
        'PATCH',
        { application_status },
      );
      setStatus(result.application_status);
      reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid gap-2">
    {!compact && <>
      <p role="status" className="text-sm font-medium">{t(status === 'applied' ? 'pages.applicationStatusApplied' : 'pages.applicationStatusSaved')}</p>
      <p className="text-sm text-muted-foreground">{t('pages.applicationStatusHelp')}</p>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{t('pages.statusSaveError')}</p>}
    <Button variant="outline" size={compact ? 'sm' : 'default'} className="h-auto justify-self-start whitespace-normal text-left" disabled={busy} onClick={() => void updateStatus()}>
      {t(status === 'saved' ? 'pages.markApplied' : 'pages.markSaved')}
    </Button>
  </div>;
}

export function JobsPage() {
  const { t } = useTranslation();
  const locale = useUiLocale();
  const c = copy[locale];
  const { projectId = '' } = useParams();
  const base = `/app/projects/${projectId}`;
  const result = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
  const [title, setTitle] = useDraft(projectId, 'new-job', 'title');
  const [description, setDescription] = useDraft(projectId, 'new-job', 'description');
  const [company, setCompany] = useDraft(projectId, 'new-job', 'company');
  const [sourceUrl, setSourceUrl] = useDraft(projectId, 'new-job', 'source_url');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'save' | 'source' | null>(null);
  const [open, setOpen] = useState(() => Boolean(title || description || company || sourceUrl));
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error') return <ErrorState onRetry={result.reload} />;
  const jobs = result.data ?? [];
  const evaluations = latestEvaluations(runs.data ?? []);
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
      <h1 className="min-w-0 break-words text-2xl font-semibold">{t('pages.jobsTitle')}</h1>
      <Button aria-expanded={showForm} aria-controls="add-job-form" onClick={() => setOpen(value => !value)}>{showForm ? c.close : <><Plus className="size-4" aria-hidden="true" />{c.addJob}</>}</Button>
    </div>
    {showForm && <Card id="add-job-form">
      <CardHeader><CardTitle>{t('workflow.addJob')}</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
          <div className="grid gap-2"><Label htmlFor="job-title">{t('workflow.jobTitle')}</Label><Input id="job-title" value={title} maxLength={300} onChange={event => setTitle(event.target.value)} required /></div>
          <div className="grid gap-2"><Label htmlFor="job-company">{t('workflow.company')}</Label><Input id="job-company" value={company} maxLength={300} onChange={event => setCompany(event.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor="job-source-url">{t('workflow.sourceUrl')}</Label><Input id="job-source-url" type="text" inputMode="url" value={sourceUrl} maxLength={2048} onChange={event => setSourceUrl(event.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor="job-description">{t('workflow.posting')}</Label><Textarea id="job-description" rows={8} maxLength={50000} value={description} onChange={event => setDescription(event.target.value)} required /></div>
          {error && <p role="alert" className="text-sm text-destructive">{t(error === 'source' ? 'pages.invalidSourceUrl' : 'pages.loadError')}</p>}
          <div><Button type="submit" disabled={busy || !title.trim() || !description.trim()}>{t('pages.save')}</Button></div>
        </form>
      </CardContent>
    </Card>}
    {!jobs.length && <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6"><p className="font-medium">{c.noJobs}</p><p className="text-sm text-muted-foreground">{c.noJobsNext}</p></div>}
    <div className="grid gap-4 md:grid-cols-2">{jobs.map(job => <Card key={job.id}>
      <CardContent className="grid gap-3 p-5">
        <div className="flex items-start gap-3">
          <FitScore score={evaluations.get(job.id)?.evaluation_result?.score ?? null} locale={locale} />
          <div className="min-w-0 flex-1">
            <h2 className="break-words font-semibold leading-snug"><Link className="hover:underline" to={`${base}/jobs/${job.id}`}>{job.title}</Link></h2>
            {job.company && <p className="break-words text-sm text-muted-foreground">{job.company}</p>}
            <p className="text-sm text-muted-foreground">{t('pages.revision')} {job.revision}</p>
          </div>
          <StatusBadge status={job.application_status ?? 'saved'} locale={locale} />
          <JobRemoveMenu projectId={projectId} jobId={job.id} title={job.title} onRemoved={result.reload} />
        </div>
        <ApplicationStatusControl projectId={projectId} job={job} reload={result.reload} compact />
      </CardContent>
    </Card>)}</div>
  </section>;
}

export function JobDetailPage() {
  const { t } = useTranslation();
  const locale = useUiLocale();
  const c = copy[locale];
  const { projectId = '', jobId = '' } = useParams();
  const navigate = useNavigate();
  const base = `/app/projects/${projectId}`;
  const result = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
  const documents = useResource<DocumentView[]>(`/projects/${projectId}/documents`);
  const sessions = useResource<SessionView[]>(`/projects/${projectId}/sessions`);
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error') return <ErrorState onRetry={result.reload} />;
  const job = result.data?.find(item => item.id === jobId);
  if (!job) return <MissingResource />;
  const source = safeHttpUrl(job.source_url);
  const evaluation = latestEvaluations(runs.data ?? []).get(job.id);
  const jobRunIds = new Set((runs.data ?? []).filter(run => run.job_revision_id === job.id).map(run => run.id));
  const related = (documents.data ?? []).filter(doc => doc.source_run_id && jobRunIds.has(doc.source_run_id));
  const evaluateHref = sessions.data?.[0] ? `${base}/sessions/${sessions.data[0].id}` : `${base}/profile`;
  return <article className="grid gap-6">
    <div className="grid gap-3">
      <PageBack to={`${base}/jobs`}>{t('nav.savedJobs')}</PageBack>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold">{job.title}</h1>
          {job.company && <p className="break-words text-muted-foreground">{job.company}</p>}
          <p className="text-sm text-muted-foreground">{t('pages.revision')} {job.revision}</p>
          {source && <a className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline" href={source} target="_blank" rel="noreferrer">{t('pages.sourceLink')}<ExternalLink className="size-4" aria-hidden="true" /></a>}
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge status={job.application_status ?? 'saved'} locale={locale} />
          <JobRemoveMenu projectId={projectId} jobId={job.id} title={job.title} onRemoved={() => navigate(`${base}/jobs`)} />
        </div>
      </div>
    </div>
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="grid min-w-0 gap-6 lg:col-span-2 lg:content-start">
        {evaluation?.evaluation_result ? <Card>
          <CardContent className="p-6">
            <details open>
              <summary className="cursor-pointer font-semibold">{c.report}</summary>
              <Markdown className="mt-3" data-testid="evaluation-report">{evaluation.evaluation_result.report_markdown}</Markdown>
            </details>
          </CardContent>
        </Card> : <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6">
          <p className="font-medium">{c.notEvaluated}</p><p className="text-sm text-muted-foreground">{c.notEvaluatedNext}</p>
          <Button asChild size="sm"><Link to={evaluateHref}>{c.evaluate}</Link></Button>
        </div>}
        <Card>
          <CardHeader><CardTitle>{c.description}</CardTitle></CardHeader>
          <CardContent><Markdown data-testid="job-description">{job.description ?? ''}</Markdown></CardContent>
        </Card>
      </div>
      <div className="grid min-w-0 gap-6 lg:content-start">
        <Card>
          <CardHeader><CardTitle>{c.fit}</CardTitle></CardHeader>
          <CardContent className="grid gap-3"><FitScore size="lg" score={evaluation?.evaluation_result?.score ?? null} locale={locale} />
            {evaluation && <Link className="text-sm text-primary hover:underline" to={`${base}/sessions/${evaluation.session_id}`}>{c.evalSession}</Link>}</CardContent>
        </Card>
        {evaluation?.evaluation_result?.skill_coverage && <Card><CardContent className="p-6"><SkillCoverage coverage={evaluation.evaluation_result.skill_coverage} locale={locale} /></CardContent></Card>}
        <Card>
          <CardHeader><CardTitle>{c.status}</CardTitle></CardHeader>
          <CardContent><ApplicationStatusControl projectId={projectId} job={job} reload={result.reload} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{c.documents}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {related.length === 0 ? <p className="text-sm text-muted-foreground">{c.noDocs}</p> :
              <ul className="divide-y">{related.map(doc => <li key={doc.id} className="py-2 first:pt-0 last:pb-0">
                <Link className="break-words font-medium hover:underline" to={`${base}/documents/${doc.id}`}>{doc.title}</Link>
                {doc.latest_revision && <p className="text-sm text-muted-foreground">{c.revision} {doc.latest_revision.revision}</p>}
              </li>)}</ul>}
            <Link className="text-sm text-primary hover:underline" to={`${base}/documents`}>{c.allDocs}</Link>
          </CardContent>
        </Card>
        <Button asChild className="h-auto whitespace-normal py-2 text-center"><Link to={evaluateHref}>{c.draft}</Link></Button>
      </div>
    </div>
  </article>;
}
