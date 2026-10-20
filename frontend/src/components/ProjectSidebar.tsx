import { Avatar } from './Avatar';
import { useAccount } from '../lib/api';
import { useId, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Bot, ChevronDown, FileText, FolderOpen, Kanban, LayoutDashboard, MessagesSquare, Search, Settings, Trash2, UserCog, UserRound, type LucideIcon } from 'lucide-react';
import { useTrashCount } from '../lib/useTrashCount';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { AppearanceControl } from './AppearanceControl';
import { HomeLink, LanguageSwitch } from './Header';
import { ProjectTree } from './ProjectTree';
import type { SidebarProject } from './ProjectTree';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

export type { SidebarProject };
const itemClass = 'flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-[15px] text-foreground transition-colors hover:bg-accent/60 data-[active=true]:bg-accent data-[active=true]:font-semibold data-[active=true]:text-accent-foreground [overflow-wrap:anywhere]';

function NavItem({ to, icon: Icon, active, onNavigate, children, count }: { to: string; icon: LucideIcon; active: boolean; onNavigate?: () => void; children: ReactNode; count?: number }) {
  return <Link className={itemClass} to={to} data-active={active} aria-current={active ? 'page' : undefined} onClick={onNavigate}><Icon size={20} strokeWidth={1.75} className="shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1">{children}</span>{count ? <span className="ms-auto rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground"><span className="sr-only"> </span>{count}</span> : null}</Link>;
}

export function ProjectSidebar({ projects = [], projectId, sessionId, onNavigate, onReload, toggle }: {
  projects?: SidebarProject[]; projectId?: string; sessionId?: string; onNavigate?: () => void; onReload?: () => void; toggle?: ReactNode;
}) {
  const { t } = useTranslation();
  const account = useAccount();
  const { pathname } = useLocation();
  const [switching, setSwitching] = useState(false);
  const navId = useId();
  const switcherTrigger = useRef<HTMLButtonElement>(null);
  const project = projects.find(item => item.id === projectId);
  const inside = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const base = `/app/projects/${projectId}`;
  const trashCount = useTrashCount(projectId);
  const groups = [
    ['work', [['overview', LayoutDashboard, t('nav.overview')], ['search', Search, t('nav.search')], ['sessions', MessagesSquare, t('nav.evaluate')], ['applications', Kanban, t('nav.savedJobs')]]],
    ['materials', [['profile', UserRound, t('nav.cv')], ['documents', FileText, t('nav.documents')]]],
    ['utilities', [['console', Bot, t('nav.console')], ['trash', Trash2, t('nav.trash')]]],
  ] as const;
  const closeNavigation = () => { setSwitching(false); onNavigate?.(); };
  return <nav className="flex min-w-0 flex-1 flex-col gap-5 p-4" aria-label={t('navigation')}>
    <div className="hidden min-w-0 items-center justify-between gap-2 px-1 pt-1 lg:flex"><div className="flex min-w-0 items-center gap-2"><HomeLink compact onClick={onNavigate} /><span className="text-lg font-bold tracking-tight">Job Search</span></div>{toggle}</div>
    {projectId ? <div className="grid min-w-0 gap-2">
    <Link to="/app/projects" onClick={onNavigate} className="inline-flex w-fit items-center gap-2 rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft size={16} aria-hidden="true" />{t('nav.allProjects')}</Link>
    <Button ref={switcherTrigger} variant="outline" className="min-h-12 w-full min-w-0 justify-between whitespace-normal bg-card px-3 text-start" onClick={() => setSwitching(true)} aria-label={t('workspace.projectSwitchLabel', { name: project?.name ?? t('nav.allProjects') })}>
      <span className="min-w-0 break-words line-clamp-2">{project?.name ?? t('workspace.chooseProject')}</span><ChevronDown size={16} className="shrink-0" aria-hidden="true" />
    </Button>
    <Dialog open={switching} onOpenChange={setSwitching}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); switcherTrigger.current?.focus(); }} aria-describedby={undefined} className="max-h-[85dvh] overflow-y-auto"><DialogTitle>{t('workspace.switchProject')}</DialogTitle>
      <ProjectTree projects={projects} projectId={projectId} sessionId={sessionId} onReload={onReload} onNavigate={closeNavigation} preserveUndo />
      <Button asChild variant="outline"><Link to="/app/projects" onClick={closeNavigation}>{t('nav.allProjects')}</Link></Button>
    </DialogContent></Dialog>
    </div> : <ul className="grid min-w-0 gap-0.5"><li className="min-w-0"><NavItem to="/app/projects" icon={FolderOpen} active={inside('/app/projects')} onNavigate={onNavigate}>{t('nav.allProjects')}</NavItem></li></ul>}
    {project && groups.map(([group, entries], index) => <section key={group} className={`grid min-w-0 gap-1.5${index ? ' border-t border-border/80 pt-4' : ''}`} aria-labelledby={`${navId}-${group}`}>
      <h2 id={`${navId}-${group}`} className="sr-only">{t(`workspace.${group}`)}</h2>
      <ul className="grid min-w-0 gap-0.5">{entries.map(([section, icon, label]) => <li className="min-w-0" key={section}><NavItem to={`${base}/${section}`} icon={icon} active={inside(`${base}/${section}`)} onNavigate={onNavigate} count={section === 'trash' ? trashCount : undefined}>{label}</NavItem></li>)}</ul>
    </section>)}
    <div className="mt-auto grid min-w-0 gap-1 border-t pt-4">
      <Link className={itemClass} to="/app/account" data-active={inside('/app/account')} aria-current={inside('/app/account') ? 'page' : undefined} onClick={onNavigate}>
        {account ? <Avatar account={account} size={20} /> : <UserCog size={20} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />}<span className="min-w-0">{t('account.menu')}</span>
      </Link>
      <NavItem to={projectId ? `/app/settings?project=${encodeURIComponent(projectId)}` : '/app/settings'} icon={Settings} active={inside('/app/settings')} onNavigate={onNavigate}>{t('settings')}</NavItem>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><AppearanceControl /><LanguageSwitch /></div>
    </div>
  </nav>;
}
