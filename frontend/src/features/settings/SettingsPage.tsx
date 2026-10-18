import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Brush, ChevronRight, FileCog, Lock, Share2, Sparkles, Webhook, Wrench } from 'lucide-react';
import { PageBack } from '@/components/PageBack';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAccount } from '../../lib/api';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import { AppearanceSettings } from './AppearanceSettings';
import { selectClass } from './Field';
import { GatewaySettings } from './GatewaySettings';
import { ProjectSharing } from './ProjectSharing';
import { TelegramSettings } from './TelegramSettings';
import { WebhookSettings } from './WebhookSettings';
import { ToolSettings } from './ToolSettings';
import { ProjectPreferences } from '../profile/ProjectPreferences';

// Grouped by who is affected; the third entry picks the plain-words label from settings:scopeLabel.
const sections = [['appearance', Brush, 'browser'], ['preferences', FileCog, 'project'], ['tools', Wrench, 'project'], ['sharing', Share2, 'project'], ['webhooks', Webhook, 'project'], ['gateway', Sparkles, 'app']] as const;
const groups = [{ id: 'you', ids: ['appearance'] }, { id: 'project', ids: ['preferences', 'tools', 'sharing', 'webhooks'] }, { id: 'admin', ids: ['gateway'] }] as const;
type Section = (typeof sections)[number][0];
// Operator-only: the shared AI gateway and the document-tool switch. The backend enforces the gateway check too.
const adminOnly: readonly string[] = ['gateway', 'tools'];

export function SettingsPage() {
  const { t } = useTranslation();
  const { t: ts } = useTranslation('settings');
  const [params, setParams] = useSearchParams();
  const isAdmin = useAccount()?.is_admin === true;
  const visible = sections.filter(([id]) => isAdmin || !adminOnly.includes(id));
  const requested = params.get('section');
  const section: Section = visible.some(([id]) => id === requested) ? requested as Section : 'appearance';
  const projects = useResource<Array<{ id: string; name: string }>>('/projects');
  const activeSection = useRef<HTMLButtonElement>(null);
  useEffect(() => { activeSection.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [section, projects.status]);
  const selectedProject = params.get('project');
  const projectId = projects.data?.some(item => item.id === selectedProject) ? selectedProject! : selectedProject ? '' : projects.data?.[0]?.id ?? '';
  if (projects.status === 'loading') return <LoadingState />;
  if (projects.status === 'error') return <ErrorState onRetry={projects.reload} />;

  return <section className="page-wrap grid gap-4">
    <PageBack to="/app" history>{t('back', { defaultValue: 'Back' })}</PageBack>
    <div className="grid gap-1">
      <h1 className="text-2xl font-semibold">{t('pages.settingsTitle', { defaultValue: 'Settings' })}</h1>
      <p className="max-w-prose text-sm text-muted-foreground">{ts(`scope.${section}`)}</p>
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label={ts('navLabel')} className="grid min-w-0 gap-4 lg:sticky lg:top-4">
        {groups.filter(group => visible.some(([id]) => (group.ids as readonly string[]).includes(id))).map(group => <div key={group.id} role="group" aria-labelledby={`settings-group-${group.id}`} className="grid min-w-0 gap-1">
          <p id={`settings-group-${group.id}`} className="px-3 text-xs font-medium text-muted-foreground">{ts(`groups.${group.id}`)}</p>
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {visible.filter(([id]) => (group.ids as readonly string[]).includes(id)).map(([id, Icon, scope]) => <li key={id} className="shrink-0">
              <button ref={section === id ? activeSection : undefined} type="button" aria-label={ts(`nav.${id}`)} aria-describedby={`settings-scope-${id}`} aria-current={section === id ? 'page' : undefined} onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.set('section', id); return next; }, { replace: true })}
                className={cn('flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-start text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:border-primary aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground lg:border-transparent')}>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="grid min-w-0"><span>{ts(`nav.${id}`)}</span><span id={`settings-scope-${id}`} className="text-xs font-normal text-muted-foreground">{ts(`scopeLabel.${scope}`)}</span></span>
              </button>
            </li>)}
          </ul>
        </div>)}
        <Link to="/app/account" className="flex min-h-11 items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          <span className="grid min-w-0 flex-1"><span>{ts('accountSecurity')}</span><span className="text-xs font-normal text-muted-foreground">{ts('accountSecurityHint')}</span></span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      </nav>
      <div className="grid min-w-0 gap-4">
        {(section === 'preferences' || section === 'tools' || section === 'sharing' || section === 'webhooks') && <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor="settings-project">{ts('projectScope')}</Label>
          <select id="settings-project" className={selectClass} value={projectId} onChange={event => setParams(previous => { const next = new URLSearchParams(previous); next.set('project', event.target.value); return next; }, { replace: true })}>
            {!projectId && <option value="">{t('workspace.chooseProject')}</option>}
            {projects.data?.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          {!projectId && <Link className="text-sm text-primary hover:underline" to="/app/projects/new">{t('pages.createProject', { defaultValue: 'Create a project' })}</Link>}
        </div>}
        {section === 'appearance' && <AppearanceSettings />}
        {section === 'webhooks' && <p className="text-sm text-muted-foreground">{ts('telegramScope')}</p>}
        {section === 'webhooks' && <TelegramSettings />}
        {section === 'gateway' && <GatewaySettings />}
        {(section === 'preferences' || section === 'tools' || section === 'sharing' || section === 'webhooks') && projectId && (section === 'preferences' ? <ProjectPreferences key={`preferences:${projectId}`} projectId={projectId} /> : section === 'tools' ? <ToolSettings key={`tools:${projectId}`} projectId={projectId} /> : section === 'sharing' ? <ProjectSharing key={`sharing:${projectId}`} projectId={projectId} /> : <WebhookSettings key={`webhooks:${projectId}`} projectId={projectId} />)}
      </div>
    </div>
  </section>;
}
