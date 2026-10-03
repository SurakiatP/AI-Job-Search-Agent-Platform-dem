import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export type SidebarProject = {
  id: string; name: string; href: string;
  sessions: { id: string; name: string; href: string }[];
};

export function ProjectSidebar({ projects = [], projectId, sessionId, onNavigate }: {
  projects?: SidebarProject[]; projectId?: string; sessionId?: string; onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  return <nav className="project-sidebar" aria-label={t('navigation')}>
    <Link className="nav-link" to="/app/projects" onClick={onNavigate}>{t('projects')}</Link>
    <div className="project-list">
      {projects.length === 0 && <p className="muted sidebar-empty">{t('noProjects')}</p>}
      {projects.map(project => <div key={project.id}>
        <Link className="nav-link project-name" to={project.href} aria-current={project.id === projectId && !sessionId ? 'page' : undefined} onClick={onNavigate}>{project.name}</Link>
        {project.id === projectId && <ul className="session-list" aria-label={t('sessions')}>
          {project.sessions.map(session => <li key={session.id}><Link className="nav-link" to={session.href} aria-current={session.id === sessionId ? 'page' : undefined} onClick={onNavigate}>{session.name}</Link></li>)}
        </ul>}
      </div>)}
    </div>
    <Link className="nav-link settings-link" to="/app/settings" onClick={onNavigate}>{t('settings')}</Link>
  </nav>;
}
