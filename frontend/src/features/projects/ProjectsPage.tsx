import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, FolderOpen, Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { PageBack } from '../../components/PageBack';
import { useResource } from './useResource';
import { ErrorState, LoadingState } from './PageStates';
import { useProjectCopy } from './copy';
import { ProjectActions } from './ProjectActions';
import { PageHeader } from '@/components/PageHeader';
import { dateLocale } from '../../lib/locale';

type Project = { id: string; name: string; created_at?: string };

export function ProjectsPage() {
  const { t } = useTranslation();
  const { c, locale } = useProjectCopy();
  const result = useResource<Project[]>('/projects');
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error') return <ErrorState onRetry={result.reload} />;
  const projects = result.data ?? [];
  // Zero projects: the getting-started guidance lives here only.
  if (!projects.length) return <section className="mx-auto my-12 grid max-w-xl justify-items-start gap-4 rounded-xl border border-dashed bg-card p-6 sm:p-8">
    <h1 className="text-2xl font-semibold">{t('pages.noProjectsTitle')}</h1>
    <p className="text-muted-foreground">{c.emptyIntro}</p>
    <ol className="grid gap-2 text-sm">{c.emptySteps.map((step, index) => <li key={step} className="flex items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{index + 1}</span>{step}</li>)}</ol>
    <Button asChild><Link to="/app/projects/new"><Plus size={17} aria-hidden="true" />{t('pages.createProject')}</Link></Button>
    <p className="text-sm text-muted-foreground">{c.scoped}</p>
  </section>;
  return <section className="grid min-w-0 gap-6 lg:gap-8">
    <div className="grid gap-1">
      <PageBack to="/app">{t('back', { defaultValue: 'Back' })}</PageBack>
      <PageHeader icon={FolderOpen} title={t('pages.projectsTitle')} lede={t('workspace.projectsIntro')} actions={<Button asChild><Link to="/app/projects/new"><Plus size={17} aria-hidden="true" />{t('pages.newProject')}</Link></Button>} />
    </div>
    <ul className="grid gap-3">{projects.map(project => <li key={project.id} className="workspace-panel flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-4 sm:px-5">
      <div className="min-w-0 flex-1 basis-56">
        <h2 className="text-lg font-semibold"><Link className="break-words text-foreground hover:text-primary hover:underline" to={`/app/projects/${project.id}/overview`}>{project.name}</Link></h2>
        {project.created_at && <p className="mt-1 text-sm text-muted-foreground">{c.created(new Date(project.created_at).toLocaleDateString(dateLocale(locale), { dateStyle: 'medium' }))}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Button asChild><Link to={`/app/projects/${project.id}/overview`} aria-label={c.openNamed(project.name)}>{c.open}<ArrowRight size={17} aria-hidden="true" /></Link></Button>
        <ProjectActions id={project.id} name={project.name} onChanged={result.reload} />
      </div>
    </li>)}</ul>
  </section>;
}
