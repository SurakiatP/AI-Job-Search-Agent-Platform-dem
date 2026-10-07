import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDraft } from '../../app/drafts';
import { Bot, FileText, Briefcase, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/PageBack';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReactNode } from 'react';
import { ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import type { DocumentView, JobRevisionView, SessionView } from '../../lib/api-types';
import { useRun } from './useRun';
import { Composer } from './Composer';
import { RunTimeline } from './RunTimeline';
import { ApprovalCard } from './ApprovalCard';
import { RunResults } from './RunResults';

function Notice({ icon, title, description, to, action }: { icon: ReactNode; title: string; description?: string; to: string; action: string }) {
  return <Card role="status" className="border-warning/50"><CardContent className="flex flex-wrap items-center gap-3 p-4">
    <span className="text-warning" aria-hidden="true">{icon}</span>
    <div className="min-w-0 flex-1"><p className="break-words font-medium">{title}</p>{description && <p className="break-words text-sm text-muted-foreground">{description}</p>}</div>
    <Button asChild size="sm"><Link to={to}>{action}</Link></Button>
  </CardContent></Card>;
}

type Provider = { provider?: string | null; configured?: boolean };
export function ChatPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const { projectId = '', sessionId = '' } = useParams();
  const initialJobId = (useLocation().state as { jobId?: string } | null)?.jobId;
  const sessions = useResource<SessionView[]>(`/projects/${projectId}/sessions`);
  const provider = useResource<Provider>(`/projects/${projectId}/settings/provider`);
  const project = useResource<{ name: string }>(`/projects/${projectId}`);
  const jobs = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const cv = useResource<unknown[]>(`/projects/${projectId}/cv`);
  const documents = useResource<DocumentView[]>(`/projects/${projectId}/documents`);
  const workflow = useRun(projectId, sessionId);
  const [message, setMessage] = useDraft(projectId, sessionId);
  const [documentPanel, setDocumentPanel] = useState(true);
  const finished = workflow.run?.finished_at;
  useEffect(() => { if (finished) documents.reload(); }, [finished, documents.reload]);
  const resources = [sessions, provider, jobs, cv, documents];
  if (resources.some(item => item.status === 'loading' && item.data === undefined) || workflow.loading) return <LoadingState />;
  if (resources.some(item => item.status === 'error')) return <ErrorState onRetry={() => resources.forEach(item => item.reload())} />;
  const session = sessions.data?.find(item => item.id === sessionId);
  if (!session) return <MissingResource />;
  const available = Boolean(provider.data?.configured && cv.data?.length);
  const active = workflow.run && ['queued', 'running', 'waiting_approval'].includes(workflow.run.status);
  const copy = locale === 'th'
    ? { cancel: 'หยุดงาน', retry: 'ลองใหม่เป็นงานใหม่', cv: 'เพิ่ม CV ก่อนเริ่มงาน', job: 'เพิ่มประกาศงาน', refresh: 'โหลดสถานะใหม่', you: 'คุณ', noDocs: 'ยังไม่มีเอกสาร เมื่อเอเจนต์ร่างเอกสารแล้วจะแสดงที่นี่', viewJob: 'ดูรายละเอียดงานนี้' }
    : { cancel: 'Stop run', retry: 'Retry as a new run', cv: 'Add a CV before starting', job: 'Add a job posting', refresh: 'Refresh status', you: 'You', noDocs: 'No documents yet. Drafts from the agent will appear here.', viewJob: 'View this job' };
  const base = `/app/projects/${projectId}`;
  const runJobId = workflow.run?.job_revision_id;
  const runJob = runJobId ? jobs.data?.find(item => item.id === runJobId) : undefined;
  return <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"><div className="flex min-w-0 flex-col gap-4">
    <Breadcrumb label={t('pages.chatTitle')} items={[{ label: project.data?.name ?? t('pages.project'), to: `${base}/overview` }, { label: session.title }]} />
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="break-words text-2xl font-semibold">{session.title}</h1><p className="text-sm text-muted-foreground">{t('pages.chatTitle')}</p></div><Button type="button" variant="outline" aria-pressed={documentPanel} onClick={() => setDocumentPanel(value => !value)}><FileText className="size-4" aria-hidden="true" />{t('pages.documentsTitle')}</Button></div>
    {!provider.data?.configured && <Notice icon={<TriangleAlert className="size-5" />} title={t('pages.noProviderTitle')} description={t('pages.noProviderDescription')} to="/app/settings" action={t('pages.settingsTitle')} />}
    {!cv.data?.length && <Notice icon={<FileText className="size-5" />} title={copy.cv} to={`${base}/profile`} action={copy.cv} />}
    {!jobs.data?.length && <Notice icon={<Briefcase className="size-5" />} title={copy.job} to={`${base}/jobs`} action={copy.job} />}
    {workflow.messages.length > 0 && <div className="grid gap-4">{workflow.messages.map(item => item.role === 'user'
      ? <article key={item.id} className="flex flex-col items-end gap-1"><p className="text-xs text-muted-foreground">{copy.you}</p><p className="plain-content chat-text m-0 max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground">{item.content}</p></article>
      : <article key={item.id} className="flex items-start gap-3"><span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true"><Bot className="size-4" /></span><div className="min-w-0 max-w-[85%]"><p className="text-xs text-muted-foreground">AI Job Search Agent Platform</p><p className="plain-content chat-text m-0 rounded-2xl rounded-tl-sm border bg-card px-4 py-2">{item.content}</p></div></article>)}</div>}
    {workflow.error && <p className="flex flex-wrap items-center gap-3 text-sm text-destructive" role="alert"><span className="min-w-0 break-words">{t(workflow.error, { defaultValue: t('pages.loadError') })}</span> <Button type="button" variant="outline" size="sm" onClick={() => void workflow.reload().catch(() => undefined)}>{copy.refresh}</Button></p>}
    <RunTimeline locale={locale} run={workflow.run} events={workflow.events} cancellationPending={workflow.cancellationPending} />
    {active && <Button type="button" variant="outline" className="self-start" disabled={workflow.submitting || workflow.cancellationPending} onClick={() => void workflow.cancel()}>{copy.cancel}</Button>}
    {workflow.run && !active && <Button type="button" variant="outline" className="self-start" disabled={workflow.submitting} onClick={() => void workflow.retry()}>{copy.retry}</Button>}
    <ApprovalCard approval={workflow.pendingApproval} locale={locale} busy={workflow.submitting} onDecision={(id, decision) => void workflow.decideApproval(id, decision)} onRefresh={() => void workflow.reload().catch(() => undefined)} />
    {runJob && <Link className="w-fit break-words text-sm text-primary hover:underline" to={`${base}/jobs/${runJob.id}`}>{copy.viewJob}: {runJob.title}</Link>}
    <RunResults projectId={projectId} locale={locale} run={workflow.run} documents={documents.data ?? []} />
    <Composer locale={locale} jobs={jobs.data ?? []} initialJobId={initialJobId} message={message} onMessageChange={setMessage} busy={!available || Boolean(active) || workflow.submitting} onSubmit={input => { void workflow.submit(input).then(run => { if (run) setMessage(''); }); }} />
  </div>{documentPanel && <Card className="self-start" role="complementary" aria-labelledby="chat-documents-heading"><CardHeader><CardTitle id="chat-documents-heading" className="text-lg">{t('pages.documentsTitle')}</CardTitle></CardHeader><CardContent className="grid gap-3">
    {documents.data?.length ? <ul className="grid gap-2">{documents.data.map(document => <li key={document.id}><Link className="break-words text-sm font-medium hover:underline" to={`${base}/documents/${document.id}`}>{document.title}</Link></li>)}</ul> : <p className="text-sm text-muted-foreground">{copy.noDocs}</p>}
    <Link className="text-sm text-primary hover:underline" to={`${base}/documents`}>{t('pages.viewDocuments')}</Link>
  </CardContent></Card>}</section>;
}
