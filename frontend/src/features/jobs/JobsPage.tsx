import { useState } from 'react';
import { useDraft } from '../../app/drafts';
import { Button } from '../../components/Button';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { safeHttpUrl, sendJson, useResource } from '../projects/useResource';

type Job = { id: string; revision: number; title: string; company?: string | null; source_url?: string | null; description?: string };

export function JobsPage() {
  const { t } = useTranslation();
  const { projectId = '' } = useParams();
  const result = useResource<Job[]>(`/projects/${projectId}/jobs`);
  const [title, setTitle] = useDraft(projectId, 'new-job', 'title');
  const [description, setDescription] = useDraft(projectId, 'new-job', 'description');
  const [company, setCompany] = useDraft(projectId, 'new-job', 'company');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error') return <ErrorState onRetry={result.reload} />;
  const jobs = result.data ?? [];
  async function save() {
    if (busy || !title.trim() || !description.trim()) return;
    setBusy(true); setError(false);
    try { await sendJson(`/projects/${projectId}/jobs`, 'POST', { title: title.trim(), description, company: company.trim() || null }); setTitle(''); setCompany(''); setDescription(''); result.reload(); }
    catch { setError(true); } finally { setBusy(false); }
  }
  return <section className="page-wrap"><h1>{t('pages.jobsTitle')}</h1><form className="surface-card" onSubmit={event => { event.preventDefault(); void save(); }}><h2>{t('workflow.addJob')}</h2>
    <label htmlFor="job-title">{t('workflow.jobTitle')}</label><input id="job-title" value={title} maxLength={300} onChange={event => setTitle(event.target.value)} required />
    <label htmlFor="job-company">{t('workflow.company')}</label><input id="job-company" value={company} maxLength={300} onChange={event => setCompany(event.target.value)} />
    <label htmlFor="job-description">{t('workflow.posting')}</label><textarea id="job-description" rows={8} maxLength={50000} value={description} onChange={event => setDescription(event.target.value)} required />
    {error && <p role="alert">{t('pages.loadError')}</p>}<Button type="submit" variant="primary" disabled={busy || !title.trim() || !description.trim()}>{t('pages.save')}</Button>
  </form>{!jobs.length && <p>{t('pages.noJobsTitle')}</p>}<div className="card-grid">{jobs.map(job => <article className="surface-card" key={job.id}><h2><Link to={`/app/projects/${projectId}/jobs/${job.id}`}>{job.title}</Link></h2>{job.company && <p>{job.company}</p>}<p className="muted">{t('pages.revision')} {job.revision}</p></article>)}</div></section>;
}

export function JobDetailPage() {
  const { t } = useTranslation();
  const { projectId = '', jobId = '' } = useParams();
  const result = useResource<Job[]>(`/projects/${projectId}/jobs`);
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error') return <ErrorState onRetry={result.reload} />;
  const job = result.data?.find(item => item.id === jobId);
  if (!job) return <MissingResource />;
  const source = safeHttpUrl(job.source_url);
  return <article className="page-wrap document-reading"><p className="eyebrow">{t('pages.jobDetailTitle', { defaultValue: 'Job posting' })}</p><h1>{job.title}</h1>{job.company && <p>{job.company}</p>}<p className="muted">{t('pages.revision', { defaultValue: 'Revision' })} {job.revision}</p>{source && <p><a href={source} target="_blank" rel="noreferrer">{t('pages.sourceLink', { defaultValue: 'Open source posting' })}</a></p>}<div className="plain-content" data-testid="job-description">{job.description}</div><Link className="button button-secondary" to={`/app/projects/${projectId}/documents`}>{t('pages.viewDocuments', { defaultValue: 'View documents' })}</Link></article>;
}
