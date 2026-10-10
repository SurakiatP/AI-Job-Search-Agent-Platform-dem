import { useEffect, useRef } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/AppShell';
import type { SidebarProject } from '../components/ProjectSidebar';
import { DocumentDetailPage, DocumentsPage } from '../features/documents/DocumentsPage';
import { SessionPage } from '../features/chat/SessionPage';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { JobDetailPage, JobsPage } from '../features/jobs/JobsPage';
import { ConsolePage } from '../features/console/ConsolePage';
import { LandingPage } from '../features/landing/LandingPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { NewProjectPage } from '../features/projects/NewProjectPage';
import { MissingResource, ErrorState, LoadingState } from '../features/projects/PageStates';
import { useResource } from '../features/projects/useResource';
import { SearchPage } from '../features/search/SearchPage';
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
  // New-project and project routes share this component, so a newly created project needs one list refresh.
  const refreshedFor = useRef<string | undefined>(undefined);
  const { data: projectList, reload: reloadProjects } = projects;
  const reloadSessions = sessions.reload;
  useEffect(() => { window.addEventListener('sessions:changed', reloadSessions); return () => window.removeEventListener('sessions:changed', reloadSessions); }, [reloadSessions]);
  useEffect(() => {
    if (!projectId || !projectList || projectList.some(item => item.id === projectId) || refreshedFor.current === projectId) return;
    refreshedFor.current = projectId;
    reloadProjects();
  }, [projectId, projectList, reloadProjects]);
  // Keep the page mounted during background reloads (rename/delete): only block on the first load.
  if ((projects.status === 'loading' && !projects.data) || (projectId && ((project.status === 'loading' && !project.data) || (sessions.status === 'loading' && !sessions.data)))) return <AppShell><LoadingState /></AppShell>;
  if (projects.status === 'error') return <AppShell><ErrorState onRetry={projects.reload} /></AppShell>;
  if (projectId && project.status === 'error') {
    if (project.errorStatus === 404) return <AppShell><MissingResource /></AppShell>;
    return <AppShell><ErrorState onRetry={project.reload} /></AppShell>;
  }
  if (projectId && sessions.status === 'error') return <AppShell><ErrorState onRetry={sessions.reload} /></AppShell>;
  const navigation: SidebarProject[] = (projects.data ?? []).map(item => ({
    id: item.id, name: item.name, href: `/app/projects/${item.id}/overview`,
    sessions: item.id === projectId ? (sessions.data ?? []).map(session => ({ id: session.id, name: session.title, href: `/app/projects/${item.id}/sessions/${session.id}` })) : [],
  }));
  return <AppShell projects={navigation} projectId={projectId} sessionId={sessionId} onReload={() => { projects.reload(); sessions.reload(); }}><Outlet /></AppShell>;
}

function AppStart() {
  const navigate = useNavigate();
  const projects = useResource<Project[]>('/projects');
  const firstProjectId = projects.data?.[0]?.id;
  useEffect(() => {
    if (projects.status !== 'ready') return;
    navigate(firstProjectId ? `/app/projects/${firstProjectId}/overview` : '/app/projects', { replace: true });
  }, [firstProjectId, navigate, projects.status]);
  if (projects.status === 'error') return <AppShell><ErrorState onRetry={projects.reload} /></AppShell>;
  return <AppShell><LoadingState /></AppShell>;
}

// Landing search teaser lands here: pick the first project and carry the query over.
function AppSearchStart() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const projects = useResource<Project[]>('/projects');
  const firstProjectId = projects.data?.[0]?.id;
  useEffect(() => {
    if (projects.status !== 'ready') return;
    navigate(firstProjectId ? `/app/projects/${firstProjectId}/search${search}` : '/app/projects', { replace: true });
  }, [firstProjectId, navigate, projects.status, search]);
  if (projects.status === 'error') return <AppShell><ErrorState onRetry={projects.reload} /></AppShell>;
  return <AppShell><LoadingState /></AppShell>;
}

function ProjectHome() {
  const { projectId } = useParams();
  return <Navigate to={`/app/projects/${projectId}/overview`} replace />;
}

function NotFoundPage() { return <AppShell><MissingResource /></AppShell>; }

function OwnerGate() {
  const session = useOwnerSession();
  const { i18n } = useTranslation();
  if (session.status === 'loading') return <AppShell><LoadingState /></AppShell>;
  if (session.status === 'error') {
    const th = i18n.language.startsWith('th');
    return <AppShell><Card className="mx-auto mt-12 max-w-xl"><CardHeader><h1 className="text-xl font-semibold">{th ? 'เปิดแอปจากตัวเริ่มใช้งาน' : 'Open the app from the local launcher'}</h1></CardHeader><CardContent><p className="text-muted-foreground">{th ? 'เซสชันหมดอายุหรือยังไม่ได้เริ่ม กรุณาเปิดลิงก์ใหม่จาก terminal ที่รันแอป แล้วโหลดหน้านี้อีกครั้ง' : 'The owner session is missing or expired. Open a fresh link from the terminal running the app, then reload this page.'}</p></CardContent></Card></AppShell>;
  }
  return <Outlet />;
}

export function AppRoutes() {
  return <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route element={<OwnerGate />}><Route path="/app" element={<AppStart />} /><Route path="/app/search" element={<AppSearchStart />} />
    <Route path="/app/settings" element={<AppWorkspace />}><Route index element={<SettingsPage />} /></Route>
    <Route path="/app/projects" element={<AppWorkspace />}><Route index element={<ProjectsPage />} /><Route path="new" element={<NewProjectPage />} /></Route>
    <Route path="/app/projects/:projectId" element={<AppWorkspace />}><Route index element={<ProjectHome />} /><Route path="overview" element={<OverviewPage />} /><Route path="console" element={<ConsolePage />} /><Route path="search" element={<SearchPage />} /><Route path="profile" element={<ProfilePage />} /><Route path="sessions/:sessionId" element={<SessionPage />} /><Route path="jobs" element={<JobsPage />} /><Route path="jobs/:jobId" element={<JobDetailPage />} /><Route path="documents" element={<DocumentsPage />} /><Route path="documents/:documentId" element={<DocumentDetailPage />} /></Route>
    </Route><Route path="*" element={<NotFoundPage />} />
  </Routes>;
}
