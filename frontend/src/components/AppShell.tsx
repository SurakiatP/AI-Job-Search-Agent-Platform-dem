import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './Header';
import { MobileDrawer } from './MobileDrawer';
import { ProjectSidebar } from './ProjectSidebar';
import type { SidebarProject } from './ProjectSidebar';

export function AppShell({ children, projects, projectId, sessionId }: {
  children: ReactNode; projects?: SidebarProject[]; projectId?: string; sessionId?: string;
}) {
  const { t } = useTranslation();
  const sidebarProps = { projects, projectId, sessionId };
  return <>
    <a href="#main-content" className="skip-link">{t('skipToContent')}</a>
    <Header menu={<MobileDrawer>{close => <ProjectSidebar {...sidebarProps} onNavigate={close} />}</MobileDrawer>} />
    <div className="app-layout">
      <aside className="desktop-sidebar"><ProjectSidebar {...sidebarProps} /></aside>
      <main id="main-content" className="main-content" tabIndex={-1}>{children}</main>
    </div>
  </>;
}
