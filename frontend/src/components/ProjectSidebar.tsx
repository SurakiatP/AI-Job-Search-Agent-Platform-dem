import type { ReactNode } from 'react';
import { Bookmark, Bot, FileText, LayoutDashboard, MessagesSquare, Search, Settings, UserRound, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { AppearanceControl } from './AppearanceControl';
import { HomeLink, LanguageSwitch } from './Header';
import { ProjectTree } from './ProjectTree';
import type { SidebarProject } from './ProjectTree';

export type { SidebarProject };

const itemClass = 'flex min-h-9 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent/60 data-[active=true]:bg-accent data-[active=true]:font-medium data-[active=true]:text-accent-foreground [overflow-wrap:anywhere]';

function NavItem({ to, icon: Icon, active, current = active, onNavigate, children }: {
  to: string; icon: LucideIcon; active: boolean; current?: boolean; onNavigate?: () => void; children: ReactNode;
}) {
  return <Link className={itemClass} to={to} data-active={active} aria-current={current ? 'page' : undefined} onClick={onNavigate}>
    <Icon size={16} aria-hidden="true" />{children}
  </Link>;
}

export function ProjectSidebar({ projects = [], projectId, sessionId, onNavigate, onReload }: {
  projects?: SidebarProject[]; projectId?: string; sessionId?: string; onNavigate?: () => void; onReload?: () => void;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const project = projects.find(item => item.id === projectId);
  const inside = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const base = `/app/projects/${projectId}`;
  const sessions = project?.sessions ?? [];
  const onSessions = inside(`${base}/sessions`);
  const sections = [
    ['overview', LayoutDashboard, t('nav.overview')],
    ['console', Bot, t('nav.console')],
    ['jobs', Bookmark, t('nav.savedJobs')],
    ['search', Search, t('nav.search')],
    ['documents', FileText, t('nav.documents')],
    ['profile', UserRound, t('nav.cv')],
  ] as const;
  return <nav className="flex flex-1 flex-col gap-4 p-4" aria-label={t('navigation')}>
    <div className="hidden px-1 pt-1 lg:block"><HomeLink onClick={onNavigate} /></div>
    <ProjectTree projects={projects} projectId={projectId} sessionId={sessionId} onNavigate={onNavigate} onReload={onReload} />
    {project && <ul className="grid gap-0.5 border-t pt-3" aria-label={t('pages.projectSections')}>
      {sections.slice(0, 1).map(([section, icon, label]) => <li key={section}><NavItem to={`${base}/${section}`} icon={icon} active={inside(`${base}/${section}`)} onNavigate={onNavigate}>{label}</NavItem></li>)}
      <li><NavItem to={sessions[0]?.href ?? `${base}/profile`} icon={MessagesSquare} active={onSessions} current={false} onNavigate={onNavigate}>{t('nav.evaluate')}</NavItem></li>
      {sections.slice(1).map(([section, icon, label]) => <li key={section}>
        <NavItem to={`${base}/${section}`} icon={icon} active={inside(`${base}/${section}`)} onNavigate={onNavigate}>{label}</NavItem>
      </li>)}
    </ul>}
    <div className="mt-auto grid gap-3">
      <NavItem to="/app/settings" icon={Settings} active={inside('/app/settings')} onNavigate={onNavigate}>{t('settings')}</NavItem>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <AppearanceControl />
        <LanguageSwitch />
      </div>
    </div>
  </nav>;
}
