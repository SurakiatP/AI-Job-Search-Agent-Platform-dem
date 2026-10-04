import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDraft } from '../../app/drafts';
import { Button } from '../../components/Button';
import { ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { useResource } from '../projects/useResource';

type Session = { id: string; title: string };
type Provider = { provider?: string | null; model?: string | null; configured?: boolean };

export function ChatPage() {
  const { t } = useTranslation();
  const { projectId = '', sessionId = '' } = useParams();
  const sessions = useResource<Session[]>(`/projects/${projectId}/sessions`);
  const provider = useResource<Provider>(`/projects/${projectId}/settings/provider`);
  const [message, setMessage] = useDraft(projectId, sessionId);
  const [documentPanel, setDocumentPanel] = useState(true);
  const [documentId, setDocumentId] = useState('');
  const documents = useResource<Array<{ id: string; title: string }>>(`/projects/${projectId}/documents`);
  if (sessions.status === 'loading' || provider.status === 'loading' || documents.status === 'loading') return <LoadingState />;
  if (sessions.status === 'error' || provider.status === 'error' || documents.status === 'error') return <ErrorState onRetry={() => { sessions.reload(); provider.reload(); documents.reload(); }} />;
  const session = sessions.data?.find(item => item.id === sessionId);
  if (!session) return <MissingResource />;
  const available = Boolean(provider.data?.configured && provider.data.provider);
  return <section className="chat-layout"><div className="chat-main"><div className="page-heading"><div><h1>{session.title || t('pages.chatTitle', { defaultValue: 'Project conversation' })}</h1><p className="muted">{t('pages.chatTitle', { defaultValue: 'Project conversation' })}</p></div><Button className="panel-toggle" aria-pressed={documentPanel} onClick={() => setDocumentPanel(value => !value)}>{t('pages.documentsTitle', { defaultValue: 'Documents' })}</Button></div>
    {!available && <aside className="notice"><h2>{t('pages.noProviderTitle', { defaultValue: 'Provider not configured' })}</h2><p>{t('pages.noProviderDescription', { defaultValue: 'Connect a provider in Settings before starting an evaluation.' })}</p><Link to="/app/settings">{t('pages.settingsTitle', { defaultValue: 'Settings' })}</Link></aside>}
    <div className="chat-transcript" aria-live="polite"><p className="muted">{t('pages.chatPending', { defaultValue: 'Conversation actions will appear here when workflow support is connected.' })}</p></div>
    <form className="chat-composer" onSubmit={event => event.preventDefault()}><label htmlFor="assistant-message">{t('pages.message', { defaultValue: 'Message the assistant' })}</label><textarea id="assistant-message" className="chat-text" value={message} onChange={event => setMessage(event.target.value)} rows={4} /><Button variant="primary" disabled>{t('pages.send', { defaultValue: 'Send' })}</Button></form>
  </div>{documentPanel && <aside className="chat-document-panel"><h2>{t('pages.documentsTitle', { defaultValue: 'Documents' })}</h2>{documents.data?.length ? <><label htmlFor="chat-document">{t('pages.documentContent', { defaultValue: 'Document content' })}</label><select id="chat-document" value={documentId} onChange={event => setDocumentId(event.target.value)}><option value="">{t('pages.empty', { defaultValue: 'No results yet' })}</option>{documents.data.map(document => <option value={document.id} key={document.id}>{document.title}</option>)}</select>{documentId && <Link to={`/app/projects/${projectId}/documents/${documentId}`}>{t('pages.documentsTitle', { defaultValue: 'Documents' })}</Link>}</> : <Link to={`/app/projects/${projectId}/documents`}>{t('pages.noDocumentsTitle', { defaultValue: 'No documents yet' })}</Link>}</aside>}</section>;
}
