import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { Header, HomeIconLink } from './Header';
import { isSidebarShortcut, SidebarToggle } from './SidebarToggle';
import { readPreference, savePreference } from '../app/theme';
import { MobileDrawer } from './MobileDrawer';
import { ProjectSidebar } from './ProjectSidebar';
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
  return <>
    <a href="#main-content" className="skip-link">{t('skipToContent')}</a>
    <div className={open ? 'min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]' : 'min-h-dvh lg:grid lg:grid-cols-[64px_minmax(0,1fr)]'}>
      {open
        ? <aside className="sticky top-0 hidden h-dvh min-w-0 flex-col overflow-y-auto border-r bg-sidebar lg:flex"><ProjectSidebar {...sidebarProps} toggle={<SidebarToggle open onToggle={toggle} />} /></aside>
        : <aside className="sticky top-0 hidden h-dvh flex-col items-center gap-3 border-r bg-sidebar py-4 lg:flex"><SidebarToggle open={false} onToggle={toggle} /><HomeIconLink /></aside>}
      <div className="min-w-0">
        <div className="lg:hidden"><Header menu={<MobileDrawer>{close => <ProjectSidebar {...sidebarProps} onNavigate={close} />}</MobileDrawer>} /></div>
        <VerifyBanner />
        <main id="main-content" data-stage={stage} className="mx-auto w-full min-w-0 max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 xl:px-10 xl:py-10" tabIndex={-1}><div key={pathname} className="page-enter">{children}</div></main>
      </div>
    </div>
  </>;
}
