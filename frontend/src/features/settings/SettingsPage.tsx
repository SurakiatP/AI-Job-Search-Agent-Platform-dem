import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Brush, Share2, Sparkles, Wrench } from 'lucide-react';
import { PageBack } from '@/components/PageBack';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import { useState } from 'react';
import { AppearanceSettings } from './AppearanceSettings';
import { selectClass } from './Field';
import { GatewaySettings } from './GatewaySettings';
import { ProjectSharing } from './ProjectSharing';
import { ToolSettings } from './ToolSettings';

const sections = [['appearance', Brush], ['gateway', Sparkles], ['tools', Wrench], ['sharing', Share2]] as const;
type Section = (typeof sections)[number][0];

export function SettingsPage() {
  const { t } = useTranslation();
  const { t: ts } = useTranslation('settings');
  const [params, setParams] = useSearchParams();
  const requested = params.get('section');
  const section: Section = sections.some(([id]) => id === requested) ? requested as Section : 'appearance';
  const projects = useResource<Array<{ id: string; name: string }>>('/projects');
  const [selectedProject, setSelectedProject] = useState('');
  const projectId = projects.data?.some(item => item.id === selectedProject) ? selectedProject : projects.data?.[0]?.id ?? '';
  if (projects.status === 'loading') return <LoadingState />;
  if (projects.status === 'error') return <ErrorState onRetry={projects.reload} />;

  return <section className="page-wrap grid gap-4">
    <PageBack to="/app" history>{t('back', { defaultValue: 'Back' })}</PageBack>
    <h1 className="text-2xl font-semibold">{t('pages.settingsTitle', { defaultValue: 'Settings' })}</h1>
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label={ts('navLabel')} className="min-w-0 lg:sticky lg:top-4">
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {sections.map(([id, Icon]) => <li key={id} className="shrink-0">
            <button type="button" aria-current={section === id ? 'page' : undefined} onClick={() => setParams({ section: id }, { replace: true })}
              className={cn('flex min-h-10 w-full items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:border-primary aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground lg:border-transparent')}>
              <Icon className="size-4 shrink-0" aria-hidden="true" />{ts(`nav.${id}`)}
            </button>
          </li>)}
        </ul>
      </nav>
      <div className="grid min-w-0 gap-4">
        {(section === 'tools' || section === 'sharing') && <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor="settings-project">{ts('projectScope')}</Label>
          <select id="settings-project" className={selectClass} value={projectId} onChange={event => setSelectedProject(event.target.value)}>
            {projects.data?.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          {!projectId && <Link className="text-sm text-primary hover:underline" to="/app/projects/new">{t('pages.createProject', { defaultValue: 'Create a project' })}</Link>}
        </div>}
        {section === 'appearance' && <AppearanceSettings />}
        {section === 'gateway' && <GatewaySettings />}
        {(section === 'tools' || section === 'sharing') && projectId && (section === 'tools' ? <ToolSettings key={`tools:${projectId}`} projectId={projectId} /> : <ProjectSharing key={`sharing:${projectId}`} projectId={projectId} />)}
      </div>
    </div>
  </section>;
}
