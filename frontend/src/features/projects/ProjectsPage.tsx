import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useResource } from './useResource';
import { EmptyPage, ErrorState, LoadingState } from './PageStates';

type Project = { id: string; name: string };

export function ProjectsPage() {
  const { t } = useTranslation();
  const result = useResource<Project[]>('/projects');
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error') return <ErrorState onRetry={result.reload} />;
  const projects = result.data ?? [];
  if (!projects.length) return <EmptyPage title={t('pages.noProjectsTitle', { defaultValue: 'No projects yet' })} description={t('pages.noProjectsDescription', { defaultValue: 'Create a project to add a CV, save a job posting and start a conversation.' })} href="/app/projects/new" action={t('pages.createProject', { defaultValue: 'Create a project' })} />;
  return <section className="page-wrap"><div className="page-heading"><div><h1>{t('pages.projectsTitle', { defaultValue: 'Projects' })}</h1><p className="muted">{t('pages.projectsDescription', { defaultValue: 'Each project keeps its CV, preferences, conversations and documents together.' })}</p></div><Link className="button button-primary" to="/app/projects/new">{t('pages.newProject', { defaultValue: 'New project' })}</Link></div><div className="card-grid">{projects.map(project => <article className="surface-card" key={project.id}><h2>{project.name}</h2><div className="card-links"><Link to={`/app/projects/${project.id}/profile`}>{t('pages.profileTitle', { defaultValue: 'Profile and CV' })}</Link><Link to={`/app/projects/${project.id}/jobs`}>{t('pages.jobsTitle', { defaultValue: 'Saved jobs' })}</Link><Link to={`/app/projects/${project.id}/documents`}>{t('pages.documentsTitle', { defaultValue: 'Documents' })}</Link></div></article>)}</div></section>;
}
