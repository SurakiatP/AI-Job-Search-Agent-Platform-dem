import { useEffect, useState } from 'react';
import { useDraft } from '../../app/drafts';
import { Button } from '../../components/Button';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { JobApplicationStatusView, JobRevisionView } from '../../lib/api-types';
import { ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { safeHttpUrl, sendJson, useResource } from '../projects/useResource';

function ApplicationStatusControl({ projectId, job, reload }: {
  projectId: string;
  job: JobRevisionView;
  reload: () => void;
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

  return <div className="job-application-status">
    <p role="status">{t(status === 'applied' ? 'pages.applicationStatusApplied' : 'pages.applicationStatusSaved')}</p>
    <p className="muted">{t('pages.applicationStatusHelp')}</p>
    {error && <p role="alert">{t('pages.statusSaveError')}</p>}
    <Button variant="secondary" disabled={busy} onClick={() => void updateStatus()}>
      {t(status === 'saved' ? 'pages.markApplied' : 'pages.markSaved')}
    </Button>
  </div>;
}

export function JobsPage() {
  const { t } = useTranslation();
  const { projectId = '' } = useParams();
  const result = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const [title, setTitle] = useDraft(projectId, 'new-job', 'title');
  const [description, setDescription] = useDraft(projectId, 'new-job', 'description');
  const [company, setCompany] = useDraft(projectId, 'new-job', 'company');
  const [sourceUrl, setSourceUrl] = useDraft(projectId, 'new-job', 'source_url');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'save' | 'source' | null>(null);
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error') return <ErrorState onRetry={result.reload} />;
  const jobs = result.data ?? [];
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
      setTitle(''); setCompany(''); setDescription(''); setSourceUrl(''); result.reload();
    } catch { setError('save'); } finally { setBusy(false); }
  }
  return <section className="page-wrap"><h1>{t('pages.jobsTitle')}</h1><form className="surface-card" onSubmit={event => { event.preventDefault(); void save(); }}><h2>{t('workflow.addJob')}</h2>
    <label htmlFor="job-title">{t('workflow.jobTitle')}</label><input id="job-title" value={title} maxLength={300} onChange={event => setTitle(event.target.value)} required />
    <label htmlFor="job-company">{t('workflow.company')}</label><input id="job-company" value={company} maxLength={300} onChange={event => setCompany(event.target.value)} />
    <label htmlFor="job-source-url">{t('workflow.sourceUrl')}</label><input id="job-source-url" type="text" inputMode="url" value={sourceUrl} maxLength={2048} onChange={event => setSourceUrl(event.target.value)} />
    <label htmlFor="job-description">{t('workflow.posting')}</label><textarea id="job-description" rows={8} maxLength={50000} value={description} onChange={event => setDescription(event.target.value)} required />
    {error && <p role="alert">{t(error === 'source' ? 'pages.invalidSourceUrl' : 'pages.loadError')}</p>}<Button type="submit" variant="primary" disabled={busy || !title.trim() || !description.trim()}>{t('pages.save')}</Button>
  </form>{!jobs.length && <p>{t('pages.noJobsTitle')}</p>}<div className="card-grid">{jobs.map(job => <article className="surface-card" key={job.id}><h2><Link to={`/app/projects/${projectId}/jobs/${job.id}`}>{job.title}</Link></h2>{job.company && <p>{job.company}</p>}<p className="muted">{t('pages.revision')} {job.revision}</p><ApplicationStatusControl projectId={projectId} job={job} reload={result.reload} /></article>)}</div></section>;
}

export function JobDetailPage() {
  const { t } = useTranslation();
  const { projectId = '', jobId = '' } = useParams();
  const result = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error') return <ErrorState onRetry={result.reload} />;
  const job = result.data?.find(item => item.id === jobId);
  if (!job) return <MissingResource />;
  const source = safeHttpUrl(job.source_url);
  return <article className="page-wrap document-reading"><p className="eyebrow">{t('pages.jobDetailTitle')}</p><h1>{job.title}</h1>{job.company && <p>{job.company}</p>}<p className="muted">{t('pages.revision')} {job.revision}</p><ApplicationStatusControl projectId={projectId} job={job} reload={result.reload} />{source && <p><a href={source} target="_blank" rel="noreferrer">{t('pages.sourceLink')}</a></p>}<div className="plain-content" data-testid="job-description">{job.description}</div><Link className="button button-secondary" to={`/app/projects/${projectId}/documents`}>{t('pages.viewDocuments')}</Link></article>;
}
