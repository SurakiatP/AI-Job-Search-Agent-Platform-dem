import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDraft } from '../../app/drafts';
import { Button } from '../../components/Button';
import { ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import type { DocumentView, JobRevisionView, SessionView } from '../../lib/api-types';
import { useRun } from './useRun';
import { Composer } from './Composer';
import { RunTimeline } from './RunTimeline';
import { ApprovalCard } from './ApprovalCard';
import { RunResults } from './RunResults';

type Provider = { provider?: string | null; configured?: boolean };
export function ChatPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const { projectId = '', sessionId = '' } = useParams();
  const sessions = useResource<SessionView[]>(`/projects/${projectId}/sessions`);
  const provider = useResource<Provider>(`/projects/${projectId}/settings/provider`);
  const jobs = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const cv = useResource<unknown[]>(`/projects/${projectId}/cv`);
  const documents = useResource<DocumentView[]>(`/projects/${projectId}/documents`);
  const workflow = useRun(projectId, sessionId);
  const [message, setMessage] = useDraft(projectId, sessionId);
  const [documentPanel, setDocumentPanel] = useState(true);
  const finished = workflow.run?.finished_at;
  useEffect(() => { if (finished) documents.reload(); }, [finished, documents.reload]);
  const resources = [sessions, provider, jobs, cv, documents];
  if (resources.some(item => item.status === 'loading') || workflow.loading) return <LoadingState />;
  if (resources.some(item => item.status === 'error')) return <ErrorState onRetry={() => resources.forEach(item => item.reload())} />;
  const session = sessions.data?.find(item => item.id === sessionId);
  if (!session) return <MissingResource />;
  const available = Boolean(provider.data?.configured && cv.data?.length);
  const active = workflow.run && ['queued', 'running', 'waiting_approval'].includes(workflow.run.status);
  const copy = locale === 'th'
    ? { cancel: 'หยุดงาน', retry: 'ลองใหม่เป็นงานใหม่', cv: 'เพิ่ม CV ก่อนเริ่มงาน', job: 'เพิ่มประกาศงาน', refresh: 'โหลดสถานะใหม่' }
    : { cancel: 'Stop run', retry: 'Retry as a new run', cv: 'Add a CV before starting', job: 'Add a job posting', refresh: 'Refresh status' };
  return <section className="chat-layout"><div className="chat-main">
    <div className="page-heading"><div><h1>{session.title}</h1><p className="muted">{t('pages.chatTitle')}</p></div><Button aria-pressed={documentPanel} onClick={() => setDocumentPanel(value => !value)}>{t('pages.documentsTitle')}</Button></div>
    {!provider.data?.configured && <aside className="notice"><h2>{t('pages.noProviderTitle')}</h2><p>{t('pages.noProviderDescription')}</p><Link to="/app/settings">{t('pages.settingsTitle')}</Link></aside>}
    {!cv.data?.length && <p className="notice"><Link to={`/app/projects/${projectId}/profile`}>{copy.cv}</Link></p>}
    {!jobs.data?.length && <p className="notice"><Link to={`/app/projects/${projectId}/jobs`}>{copy.job}</Link></p>}
    <div className="chat-transcript">{workflow.messages.map(item => <article className="surface-card" key={item.id}><p className="eyebrow">{item.role === 'user' ? (locale === 'th' ? 'คุณ' : 'You') : 'AI Job Search Agent Platform'}</p><p className="plain-content">{item.content}</p></article>)}</div>
    {workflow.error && <p className="field-error" role="alert">{t(workflow.error, { defaultValue: t('pages.loadError') })} <Button onClick={() => void workflow.reload().catch(() => undefined)}>{copy.refresh}</Button></p>}
    <RunTimeline locale={locale} run={workflow.run} events={workflow.events} cancellationPending={workflow.cancellationPending} />
    {active && <Button disabled={workflow.submitting || workflow.cancellationPending} onClick={() => void workflow.cancel()}>{copy.cancel}</Button>}
    {workflow.run && !active && <Button disabled={workflow.submitting} onClick={() => void workflow.retry()}>{copy.retry}</Button>}
    <ApprovalCard approval={workflow.pendingApproval} locale={locale} busy={workflow.submitting} onDecision={(id, decision) => void workflow.decideApproval(id, decision)} onRefresh={() => void workflow.reload().catch(() => undefined)} />
    <RunResults projectId={projectId} locale={locale} run={workflow.run} documents={documents.data ?? []} />
    <Composer locale={locale} jobs={jobs.data ?? []} message={message} onMessageChange={setMessage} busy={!available || Boolean(active) || workflow.submitting} onSubmit={input => { void workflow.submit(input).then(run => { if (run) setMessage(''); }); }} />
  </div>{documentPanel && <aside className="chat-document-panel"><h2>{t('pages.documentsTitle')}</h2>{documents.data?.map(document => <p key={document.id}><Link to={`/app/projects/${projectId}/documents/${document.id}`}>{document.title}</Link></p>)}<Link to={`/app/projects/${projectId}/documents`}>{t('pages.viewDocuments')}</Link></aside>}</section>;
}
