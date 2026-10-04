import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/AppShell';
import type { SidebarProject } from '../components/ProjectSidebar';
import { DocumentDetailPage, DocumentsPage } from '../features/documents/DocumentsPage';
import { ChatPage } from '../features/chat/ChatPage';
import { JobDetailPage, JobsPage } from '../features/jobs/JobsPage';
import { LandingPage } from '../features/landing/LandingPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { NewProjectPage } from '../features/projects/NewProjectPage';
import { MissingResource, ErrorState, LoadingState } from '../features/projects/PageStates';
import { useResource } from '../features/projects/useResource';
import { SettingsPage } from '../features/settings/SettingsPage';
import { useOwnerSession } from '../lib/api';
import './routes.css';

type Project = { id: string; name: string };
type Session = { id: string; title: string };

function AppWorkspace() {
  const { projectId, sessionId } = useParams();
  const projects = useResource<Project[]>('/projects');
  const project = useResource<Project>(projectId ? `/projects/${projectId}` : null);
  const sessions = useResource<Session[]>(projectId ? `/projects/${projectId}/sessions` : null);
  if (projects.status === 'loading' || (projectId && (project.status === 'loading' || sessions.status === 'loading'))) return <AppShell><LoadingState /></AppShell>;
  if (projects.status === 'error') return <AppShell><ErrorState onRetry={projects.reload} /></AppShell>;
  if (projectId && project.status === 'error') {
    if (project.errorStatus === 404) return <AppShell><MissingResource /></AppShell>;
    return <AppShell><ErrorState onRetry={project.reload} /></AppShell>;
  }
  if (projectId && sessions.status === 'error') return <AppShell><ErrorState onRetry={sessions.reload} /></AppShell>;
  const navigation: SidebarProject[] = (projects.data ?? []).map(item => ({
    id: item.id, name: item.name, href: `/app/projects/${item.id}/profile`,
    sessions: item.id === projectId ? (sessions.data ?? []).map(session => ({ id: session.id, name: session.title, href: `/app/projects/${item.id}/sessions/${session.id}` })) : [],
  }));
  return <AppShell projects={navigation} projectId={projectId} sessionId={sessionId}><Outlet /></AppShell>;
}

function AppStart() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projects = useResource<Project[]>('/projects');
  const firstProjectId = projects.data?.[0]?.id;
  const sessions = useResource<Session[]>(firstProjectId ? `/projects/${firstProjectId}/sessions` : null);
  useEffect(() => {
    if (projects.status !== 'ready') return;
    if (!firstProjectId) { navigate('/app/projects', { replace: true }); return; }
    if (sessions.status === 'ready') {
      const firstSession = sessions.data?.[0];
      navigate(firstSession ? `/app/projects/${firstProjectId}/sessions/${firstSession.id}` : `/app/projects/${firstProjectId}/profile`, { replace: true });
    }
  }, [firstProjectId, navigate, projects.status, sessions.data, sessions.status]);
  if (projects.status === 'error') return <AppShell><ErrorState onRetry={projects.reload} /></AppShell>;
  if (firstProjectId && sessions.status === 'error') return <AppShell><ErrorState onRetry={sessions.reload} /></AppShell>;
  return <AppShell><p role="status">{t('pages.loading', { defaultValue: 'Loading…' })}</p></AppShell>;
}

function ProjectHome() {
  const { projectId } = useParams();
  return <Navigate to={`/app/projects/${projectId}/profile`} replace />;
}

function NotFoundPage() { return <AppShell><MissingResource /></AppShell>; }

function OwnerGate() {
  const session = useOwnerSession();
  const { i18n } = useTranslation();
  if (session.status === 'loading') return <AppShell><LoadingState /></AppShell>;
  if (session.status === 'error') return <AppShell><section className="surface-card"><h1>{i18n.language.startsWith('th') ? 'เปิดแอปจากตัวเริ่มใช้งาน' : 'Open the app from the local launcher'}</h1><p>{i18n.language.startsWith('th') ? 'เซสชันหมดอายุหรือยังไม่ได้เริ่ม กรุณาเปิดลิงก์ใหม่จาก terminal ที่รันแอป แล้วโหลดหน้านี้อีกครั้ง' : 'The owner session is missing or expired. Open a fresh link from the terminal running the app, then reload this page.'}</p></section></AppShell>;
  return <Outlet />;
}

export function AppRoutes() {
  return <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route element={<OwnerGate />}><Route path="/app" element={<AppStart />} />
    <Route path="/app/settings" element={<AppWorkspace />}><Route index element={<SettingsPage />} /></Route>
    <Route path="/app/projects" element={<AppWorkspace />}><Route index element={<ProjectsPage />} /><Route path="new" element={<NewProjectPage />} /></Route>
    <Route path="/app/projects/:projectId" element={<AppWorkspace />}><Route index element={<ProjectHome />} /><Route path="profile" element={<ProfilePage />} /><Route path="sessions/:sessionId" element={<ChatPage />} /><Route path="jobs" element={<JobsPage />} /><Route path="jobs/:jobId" element={<JobDetailPage />} /><Route path="documents" element={<DocumentsPage />} /><Route path="documents/:documentId" element={<DocumentDetailPage />} /></Route>
    </Route><Route path="*" element={<NotFoundPage />} />
  </Routes>;
}
