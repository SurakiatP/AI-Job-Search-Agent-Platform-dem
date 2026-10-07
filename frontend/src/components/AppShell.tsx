import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './Header';
import { MobileDrawer } from './MobileDrawer';
import { ProjectSidebar } from './ProjectSidebar';
import type { SidebarProject } from './ProjectSidebar';

export function AppShell({ children, projects, projectId, sessionId, onReload }: {
  children: ReactNode; projects?: SidebarProject[]; projectId?: string; sessionId?: string; onReload?: () => void;
}) {
  const { t } = useTranslation();
  const sidebarProps = { projects, projectId, sessionId, onReload };
  return <>
    <a href="#main-content" className="skip-link">{t('skipToContent')}</a>
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r bg-sidebar lg:flex"><ProjectSidebar {...sidebarProps} /></aside>
      <div className="min-w-0">
        <div className="lg:hidden"><Header menu={<MobileDrawer>{close => <ProjectSidebar {...sidebarProps} onNavigate={close} />}</MobileDrawer>} /></div>
        <main id="main-content" className="page-enter mx-auto w-full min-w-0 max-w-6xl px-6 py-8 lg:px-10" tabIndex={-1}>{children}</main>
      </div>
    </div>
  </>;
}
