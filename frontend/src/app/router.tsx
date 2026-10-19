import { lazy, Suspense, useEffect, useRef } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../components/AppShell';
import type { SidebarProject } from '../components/ProjectSidebar';

import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';

import { MissingResource, ErrorState, LoadingState } from '../features/projects/PageStates';
import { useResource } from '../features/projects/useResource';

import { useOwnerSession } from '../lib/api';
import './routes.css';

const DocumentDetailPage = lazy(() => import('../features/documents/DocumentsPage').then(module => ({ default: module.DocumentDetailPage })));
const DocumentsPage = lazy(() => import('../features/documents/DocumentsPage').then(module => ({ default: module.DocumentsPage })));
const SessionPage = lazy(() => import('../features/chat/SessionPage').then(module => ({ default: module.SessionPage })));
const SessionsPage = lazy(() => import('../features/sessions/SessionsPage').then(module => ({ default: module.SessionsPage })));
const JobDetailPage = lazy(() => import('../features/jobs/JobsPage').then(module => ({ default: module.JobDetailPage })));
const JobsPage = lazy(() => import('../features/jobs/JobsPage').then(module => ({ default: module.JobsPage })));
const ConsolePage = lazy(() => import('../features/console/ConsolePage').then(module => ({ default: module.ConsolePage })));
const LandingPage = lazy(() => import('../features/landing/LandingPage').then(module => ({ default: module.LandingPage })));
const OverviewPage = lazy(() => import('../features/overview/OverviewPage').then(module => ({ default: module.OverviewPage })));
const ProfilePage = lazy(() => import('../features/profile/ProfilePage').then(module => ({ default: module.ProfilePage })));
const ProjectsPage = lazy(() => import('../features/projects/ProjectsPage').then(module => ({ default: module.ProjectsPage })));
const NewProjectPage = lazy(() => import('../features/projects/NewProjectPage').then(module => ({ default: module.NewProjectPage })));
const SearchPage = lazy(() => import('../features/search/SearchPage').then(module => ({ default: module.SearchPage })));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then(module => ({ default: module.SettingsPage })));
const ConsentPage = lazy(() => import('../features/oauth/ConsentPage').then(module => ({ default: module.ConsentPage })));
const DocsPage = lazy(() => import('../features/docs/DocsPage').then(module => ({ default: module.DocsPage })));
const FeaturePage = lazy(() => import('../features/landing/FeaturePage').then(module => ({ default: module.FeaturePage })));
const AccountPage = lazy(() => import('../features/account/AccountPage').then(module => ({ default: module.AccountPage })));
const DigestUnsubscribePage = lazy(() => import('../features/digest/UnsubscribePage').then(module => ({ default: module.DigestUnsubscribePage })));
const ForgotPasswordPage = lazy(() => import('../features/auth/AuthPages').then(module => ({ default: module.ForgotPasswordPage })));
const LoginPage = lazy(() => import('../features/auth/AuthPages').then(module => ({ default: module.LoginPage })));
const ResetPasswordPage = lazy(() => import('../features/auth/AuthPages').then(module => ({ default: module.ResetPasswordPage })));
const SignupPage = lazy(() => import('../features/auth/AuthPages').then(module => ({ default: module.SignupPage })));
const VerifyEmailPage = lazy(() => import('../features/auth/AuthPages').then(module => ({ default: module.VerifyEmailPage })));

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
  return <AppShell projects={navigation} projectId={projectId} sessionId={sessionId} onReload={() => { projects.reload(); sessions.reload(); }}><Suspense fallback={<LoadingState />}><Outlet /></Suspense></AppShell>;
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
  const { t } = useTranslation();
  const location = useLocation();
  if (session.status === 'loading') return <RouteLoading />;
  if (session.status === 'anonymous') return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (session.status === 'error') {
    return <AppShell><Card className="mx-auto mt-12 max-w-xl"><CardHeader><h1 className="text-xl font-semibold">{t('auth.sessionExpiredTitle')}</h1></CardHeader><CardContent className="grid gap-4"><p className="text-muted-foreground">{t('auth.sessionExpiredBody')}</p><div><Button asChild><Link to="/login">{t('auth.loginAction')}</Link></Button></div></CardContent></Card></AppShell>;
  }
  return <Outlet />;
}

function RouteLoading() {
  return <main id="main-content" tabIndex={-1} className="min-h-dvh bg-background p-6"><LoadingState /></main>;
}

export function AppRoutes() {
  return <Suspense fallback={<RouteLoading />}><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/docs" element={<DocsPage />} /><Route path="/features/:slug" element={<FeaturePage />} />
    <Route path="/login" element={<LoginPage />} /><Route path="/signup" element={<SignupPage />} /><Route path="/verify-email" element={<VerifyEmailPage />} /><Route path="/digest/unsubscribe" element={<DigestUnsubscribePage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route element={<OwnerGate />}><Route path="/app" element={<AppStart />} /><Route path="/app/search" element={<AppSearchStart />} />
    <Route path="/app/oauth/consent" element={<ConsentPage />} />
    <Route path="/app/account" element={<AppWorkspace />}><Route index element={<AccountPage />} /></Route>
    <Route path="/app/settings" element={<AppWorkspace />}><Route index element={<SettingsPage />} /></Route>
    <Route path="/app/projects" element={<AppWorkspace />}><Route index element={<ProjectsPage />} /><Route path="new" element={<NewProjectPage />} /></Route>
    <Route path="/app/projects/:projectId" element={<AppWorkspace />}><Route index element={<ProjectHome />} /><Route path="overview" element={<OverviewPage />} /><Route path="console" element={<ConsolePage />} /><Route path="search" element={<SearchPage />} /><Route path="profile" element={<ProfilePage />} /><Route path="sessions" element={<SessionsPage />} /><Route path="sessions/:sessionId" element={<SessionPage />} /><Route path="applications" element={<JobsPage />} /><Route path="jobs" element={<Navigate to="../applications" replace />} /><Route path="jobs/:jobId" element={<JobDetailPage />} /><Route path="documents" element={<DocumentsPage />} /><Route path="documents/:documentId" element={<DocumentDetailPage />} /></Route>
    </Route><Route path="*" element={<NotFoundPage />} />
  </Routes></Suspense>;
}
