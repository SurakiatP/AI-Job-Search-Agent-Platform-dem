import { AccountMenu } from './AccountMenu';
import { RunIndicator } from './RunIndicator';
import { NotificationBell } from './NotificationBell';
import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, FileText, FolderOpen, Kanban, LayoutDashboard, Search, UserRound, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { HomeLink, LanguageToggle } from './Header';
import { ProjectTree } from './ProjectTree';
import type { SidebarProject } from './ProjectTree';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

export type { SidebarProject };
const itemClass = 'flex min-h-11 lg:min-h-10 min-w-0 items-center gap-2 rounded-lg px-3 text-sm text-foreground transition-colors hover:bg-primary/[0.04] data-[active=true]:bg-[color:var(--nav-active)] data-[active=true]:font-medium data-[active=true]:text-primary [overflow-wrap:anywhere]';

export const navEntries = [['overview', LayoutDashboard, 'nav.overview', undefined], ['search', Search, 'nav.search', 'search'], ['applications', Kanban, 'nav.savedJobs', 'track'], ['profile', UserRound, 'nav.cv', 'cv'], ['documents', FileText, 'nav.documents', 'docs']] as const;

function NavItem({ to, icon: Icon, active, onNavigate, children, stage }: { stage?: string; to: string; icon: LucideIcon; active: boolean; onNavigate?: () => void; children: ReactNode }) {
  return <Link className={itemClass} to={to} data-active={active} aria-current={active ? 'page' : undefined} onClick={onNavigate}><span className={stage ? 'stage-tile' : 'inline-flex text-muted-foreground'} data-stage={stage} data-active={active}><Icon size={18} strokeWidth={1.75} className="shrink-0" aria-hidden="true" /></span><span className="min-w-0 flex-1">{children}</span></Link>;
}

// The project switcher is shared by the desktop sidebar and the mobile header.
export function ProjectSwitcher({ projects = [], projectId, sessionId, onReload, onNavigate, compact = false }: {
  projects?: SidebarProject[]; projectId?: string; sessionId?: string; onReload?: () => void; onNavigate?: () => void; compact?: boolean;
}) {
  const { t } = useTranslation();
  const [switching, setSwitching] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const project = projects.find(item => item.id === projectId);
  const close = () => { setSwitching(false); onNavigate?.(); };
  return <>
    <Button ref={trigger} variant="outline" className={compact ? 'min-h-11 min-w-0 max-w-[55vw] justify-between gap-2 px-3 text-start' : 'min-h-12 w-full min-w-0 justify-between whitespace-normal px-3 text-start'} onClick={() => setSwitching(true)} aria-label={t('workspace.projectSwitchLabel', { name: project?.name ?? t('nav.allProjects') })}>
      <span className={compact ? 'min-w-0 truncate' : 'min-w-0 break-words line-clamp-2'}>{project?.name ?? t('workspace.chooseProject')}</span><ChevronDown size={16} className="shrink-0" aria-hidden="true" />
    </Button>
    <Dialog open={switching} onOpenChange={setSwitching}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }} aria-describedby={undefined} className="max-h-[85dvh] overflow-y-auto"><DialogTitle>{t('workspace.switchProject')}</DialogTitle>
      <ProjectTree projects={projects} projectId={projectId} sessionId={sessionId} onReload={onReload} onNavigate={close} preserveUndo />
      <Button asChild variant="outline"><Link to="/app/projects" onClick={close}>{t('nav.allProjects')}</Link></Button>
    </DialogContent></Dialog>
  </>;
}

export function ProjectSidebar({ projects = [], projectId, sessionId, onNavigate, onReload, toggle }: {
  projects?: SidebarProject[]; projectId?: string; sessionId?: string; onNavigate?: () => void; onReload?: () => void; toggle?: ReactNode;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const inside = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const base = `/app/projects/${projectId}`;
  return <div className="flex min-w-0 flex-1 flex-col gap-4 p-3">
    <div className="flex min-w-0 items-center justify-between gap-2 px-1 pt-1"><div className="flex min-w-0 items-center gap-2"><HomeLink compact onClick={onNavigate} /><span className="font-heading text-lg font-medium tracking-normal">Job Search</span></div><div className="flex shrink-0 items-center gap-1"><LanguageToggle />{toggle}</div></div>
    {projectId && <ProjectSwitcher projects={projects} projectId={projectId} sessionId={sessionId} onReload={onReload} onNavigate={onNavigate} />}
    <nav aria-label={t('navigation')}><ul className="grid min-w-0 gap-0.5">{projectId
      ? navEntries.map(([section, icon, key, stage]) => <li className="min-w-0" key={section}><NavItem to={`${base}/${section}`} icon={icon} stage={stage} active={inside(`${base}/${section}`) || (section === 'applications' && inside(`${base}/jobs`))} onNavigate={onNavigate}>{t(key)}</NavItem></li>)
      : <li className="min-w-0"><NavItem to="/app/projects" icon={FolderOpen} active={inside('/app/projects')} onNavigate={onNavigate}>{t('nav.allProjects')}</NavItem></li>}</ul></nav>
    <div className="mt-auto grid min-w-0 gap-2 border-t pt-3">
      <RunIndicator projectId={projectId} />
      <div className="flex min-w-0 items-center gap-1"><div className="min-w-0 flex-1"><AccountMenu projectId={projectId} wide /></div><NotificationBell /></div>
    </div>
  </div>;
}
