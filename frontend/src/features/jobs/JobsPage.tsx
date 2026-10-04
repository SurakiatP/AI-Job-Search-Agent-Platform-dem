import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { EmptyPage, ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { safeHttpUrl, useResource } from '../projects/useResource';

type Job = { id: string; revision: number; title: string; company?: string | null; source_url?: string | null; description?: string };

export function JobsPage() {
  const { t } = useTranslation();
  const { projectId = '' } = useParams();
  const result = useResource<Job[]>(`/projects/${projectId}/jobs`);
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error') return <ErrorState onRetry={result.reload} />;
  const jobs = result.data ?? [];
  if (!jobs.length) return <EmptyPage title={t('pages.noJobsTitle', { defaultValue: 'No saved jobs' })} description={t('pages.noJobsDescription', { defaultValue: 'Add a supplied job posting to see it here.' })} href={`/app/projects/${projectId}/profile`} action={t('pages.profileTitle', { defaultValue: 'Profile and CV' })} />;
  return <section className="page-wrap"><div className="page-heading"><div><h1>{t('pages.jobsTitle', { defaultValue: 'Saved jobs' })}</h1><p className="muted">{t('pages.project', { defaultValue: 'Project' })}</p></div></div><div className="card-grid">{jobs.map(job => <article className="surface-card" key={job.id}><h2><Link to={`/app/projects/${projectId}/jobs/${job.id}`}>{job.title}</Link></h2>{job.company && <p>{job.company}</p>}<p className="muted">{t('pages.revision', { defaultValue: 'Revision' })} {job.revision}</p></article>)}</div></section>;
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
