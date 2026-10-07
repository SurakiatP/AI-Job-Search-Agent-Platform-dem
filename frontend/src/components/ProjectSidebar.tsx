import type { ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bookmark, ChevronsUpDown, FileText, FolderKanban, LayoutDashboard, MessagesSquare, Search, Settings, UserRound, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { AppearanceControl } from './AppearanceControl';
import { LanguageSwitch, Wordmark } from './Header';
import { Button } from './ui/button';

export type SidebarProject = {
  id: string; name: string; href: string;
  sessions: { id: string; name: string; href: string }[];
};

const itemClass = 'flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent/60 data-[active=true]:bg-accent data-[active=true]:font-medium data-[active=true]:text-accent-foreground [overflow-wrap:anywhere]';
const menuItemClass = 'flex min-h-10 cursor-pointer items-center rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [overflow-wrap:anywhere]';

function NavItem({ to, icon: Icon, active, current = active, onNavigate, children }: {
  to: string; icon: LucideIcon; active: boolean; current?: boolean; onNavigate?: () => void; children: ReactNode;
}) {
  return <Link className={itemClass} to={to} data-active={active} aria-current={current ? 'page' : undefined} onClick={onNavigate}>
    <Icon size={18} aria-hidden="true" />{children}
  </Link>;
}

export function ProjectSidebar({ projects = [], projectId, sessionId, onNavigate }: {
  projects?: SidebarProject[]; projectId?: string; sessionId?: string; onNavigate?: () => void;
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
    ['jobs', Bookmark, t('nav.savedJobs')],
    ['search', Search, t('nav.search')],
    ['documents', FileText, t('nav.documents')],
    ['profile', UserRound, t('nav.cv')],
  ] as const;
  return <nav className="flex flex-1 flex-col gap-4 p-4" aria-label={t('navigation')}>
    <div className="hidden lg:block px-1 pt-1"><Wordmark /></div>
    {project ? <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" className="h-auto w-full justify-between whitespace-normal py-2 text-start [overflow-wrap:anywhere]">
          <span className="min-w-0">{project.name}</span><ChevronsUpDown aria-hidden="true" size={16} className="text-muted-foreground" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className="z-50 w-60 max-w-[90vw] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
          {projects.map(item => <DropdownMenu.Item key={item.id} asChild><Link className={cn(menuItemClass, item.id === projectId && 'font-medium')} to={item.href} onClick={onNavigate}>{item.name}</Link></DropdownMenu.Item>)}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild><Link className={menuItemClass} to="/app/projects" onClick={onNavigate}>{t('nav.allProjects')}</Link></DropdownMenu.Item>
          <DropdownMenu.Item asChild><Link className={menuItemClass} to="/app/projects/new" onClick={onNavigate}>{t('nav.newProject')}</Link></DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root> : <NavItem to="/app/projects" icon={FolderKanban} active={inside('/app/projects')} onNavigate={onNavigate}>{t('projects')}</NavItem>}
    {project && <ul className="grid gap-1" aria-label={t('pages.projectSections')}>
      {sections.slice(0, 1).map(([section, icon, label]) => <li key={section}><NavItem to={`${base}/${section}`} icon={icon} active={inside(`${base}/${section}`)} onNavigate={onNavigate}>{label}</NavItem></li>)}
      <li>
        <NavItem to={sessions[0]?.href ?? `${base}/profile`} icon={MessagesSquare} active={onSessions} current={onSessions && !sessions.some(session => session.id === sessionId)} onNavigate={onNavigate}>{t('nav.evaluate')}</NavItem>
        {sessions.length > 0 && <ul className="ms-5 mt-1 grid gap-0.5 border-s ps-2" aria-label={t('sessions')}>
          {sessions.map(session => <li key={session.id}><Link className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-accent-foreground [overflow-wrap:anywhere]" to={session.href} aria-current={session.id === sessionId ? 'page' : undefined} onClick={onNavigate}>{session.name}</Link></li>)}
        </ul>}
      </li>
      {sections.slice(1).map(([section, icon, label]) => <li key={section}>
        <NavItem to={`${base}/${section}`} icon={icon} active={inside(`${base}/${section}`)} onNavigate={onNavigate}>
          {label}
        </NavItem>
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
