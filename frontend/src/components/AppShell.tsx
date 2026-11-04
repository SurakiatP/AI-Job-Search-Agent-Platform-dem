import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { HomeIconLink, HomeLink, LanguageToggle } from './Header';
import { AccountMenu } from './AccountMenu';
import { BottomNav } from './BottomNav';
import { RunIndicator } from './RunIndicator';
import { NotificationBell, NotificationsProvider } from './NotificationBell';
import { isSidebarShortcut, SidebarToggle } from './SidebarToggle';
import { readPreference, savePreference } from '../app/theme';
import { ProjectSidebar, ProjectSwitcher } from './ProjectSidebar';
import type { SidebarProject } from './ProjectSidebar';
import { VerifyBanner } from './VerifyBanner';

const STAGE_BY_SECTION: Record<string, string> = { profile: 'cv', search: 'search', sessions: 'evaluate', practice: 'evaluate', documents: 'docs', applications: 'track' };

export function AppShell({ children, projects, projectId, sessionId, onReload }: {
  children: ReactNode; projects?: SidebarProject[]; projectId?: string; sessionId?: string; onReload?: () => void;
}) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => readPreference('ui.sidebar', ['open', 'closed'], 'open') === 'open');
  const toggle = () => setOpen(value => { savePreference('ui.sidebar', value ? 'closed' : 'open'); return !value; });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (isSidebarShortcut(event)) { event.preventDefault(); toggle(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const stage = STAGE_BY_SECTION[pathname.split('/')[4] ?? ''];
  const sidebarProps = { projects, projectId, sessionId, onReload };
  return <NotificationsProvider>
    <a href="#main-content" className="skip-link">{t('skipToContent')}</a>
    <div className={open ? 'min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:bg-sidebar' : 'min-h-dvh lg:grid lg:grid-cols-[64px_minmax(0,1fr)] lg:bg-sidebar'}>
      {open
        ? <aside className="sticky top-0 hidden h-dvh min-w-0 flex-col overflow-y-auto bg-sidebar lg:flex"><ProjectSidebar {...sidebarProps} toggle={<SidebarToggle open onToggle={toggle} />} /></aside>
        : <aside className="sticky top-0 hidden h-dvh flex-col items-center gap-3 bg-sidebar py-4 lg:flex"><SidebarToggle open={false} onToggle={toggle} /><HomeIconLink /></aside>}
      <div className="min-w-0 lg:p-2 lg:ps-0">
        <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between gap-2 border-b bg-background/90 px-4 py-2 backdrop-blur lg:hidden">
          {projectId ? <ProjectSwitcher {...sidebarProps} compact /> : <HomeLink />}
          <div className="flex shrink-0 items-center gap-2"><RunIndicator projectId={projectId} compact /><NotificationBell /><LanguageToggle /><AccountMenu projectId={projectId} /></div>
        </header>
        <div className="min-w-0 lg:min-h-[calc(100dvh-16px)] lg:overflow-clip lg:rounded-2xl lg:border lg:bg-background ambient-surface">
        <VerifyBanner />
        <main id="main-content" data-stage={stage} className={`${projectId ? 'pb-24 lg:pb-10 ' : ''}mx-auto w-full min-w-0 max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 xl:px-10 xl:py-10`} tabIndex={-1}><div key={pathname} className="page-enter">{children}</div></main>
        </div>
      </div>
    </div>
    {projectId && <BottomNav projectId={projectId} />}
  </NotificationsProvider>;
}
