import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { PageBack } from '../../components/PageBack';
import { useDraft, useFileDraft } from '../../app/drafts';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { apiRequest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';
import { sendJson, useResource } from '../projects/useResource';

type Revision = { id: string; revision: number; original_filename?: string; mime_type?: string; size_bytes?: number };
type Preferences = { project_id: string; output_language: 'th' | 'en'; notifications_enabled: boolean };
type Session = { id: string; title: string };

export function ProfilePage() {
  const { t } = useTranslation();
  const { projectId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [sessionTitle, setSessionTitle] = useDraft(projectId, 'new-session', 'title');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const state = location.state as { initialSessionId?: string; initialGoal?: string } | null;
  const [goalDraft, setGoalDraft] = useDraft(projectId, state?.initialSessionId ?? '');
  const cv = useResource<Revision[]>(`/projects/${projectId}/cv`);
  const preferences = useResource<Preferences>(`/projects/${projectId}/preferences`);
  const sessions = useResource<Session[]>(`/projects/${projectId}/sessions`);
  const [text, setText] = useDraft(projectId, 'profile', 'cv-text');
  const [file, setFile] = useFileDraft(projectId, 'profile', 'cv-file');
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [languageDraft, setLanguageDraft] = useDraft(projectId, 'profile', 'output-language');
  const [notificationsDraft, setNotificationsDraft] = useDraft(projectId, 'profile', 'notifications');
  const language: 'th' | 'en' = languageDraft === 'th' || languageDraft === 'en' ? languageDraft : preferences.data?.output_language ?? 'th';
  const notifications = notificationsDraft ? notificationsDraft === 'true' : preferences.data?.notifications_enabled ?? true;
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    if (state?.initialGoal && !goalDraft) setGoalDraft(state.initialGoal);
  }, [goalDraft, setGoalDraft, state?.initialGoal]);

  if (cv.status === 'loading' || preferences.status === 'loading' || sessions.status === 'loading') return <LoadingState />;
  if (cv.status === 'error' || preferences.status === 'error' || sessions.status === 'error') return <ErrorState onRetry={() => { cv.reload(); preferences.reload(); sessions.reload(); }} />;
  const currentSession = sessions.data?.find(item => item.id === state?.initialSessionId) ?? sessions.data?.[0];
  async function upload() {
    const selected = file ?? (text.trim() ? new File([text], 'pasted-cv.txt', { type: 'text/plain' }) : null);
    if (!selected) return;
    if (selected.size > 20 * 1024 * 1024) { setUploadError('pages.uploadTooLarge'); return; }
    const extension = selected.name.split('.').pop()?.toLowerCase();
    if (!extension || !['pdf', 'docx', 'txt'].includes(extension)) { setUploadError('pages.uploadInvalidType'); return; }
    setBusy(true); setUploadError(null);
    try {
      const body = new FormData(); body.set('file', selected);
      await apiRequest(`/projects/${projectId}/cv`, { method: 'POST', body });
      setText(''); setFile(undefined); cv.reload();
    } catch (error) {
      const messages: Record<string, string> = {
        scanned_pdf_unsupported: 'errors.scanned_pdf_unsupported',
        document_encrypted: 'errors.document_encrypted',
        document_invalid: 'errors.document_invalid',
        empty_input: 'errors.empty_input',
        document_expansion_limit: 'errors.document_limits',
        extracted_text_limit: 'errors.document_limits',
        input_size_invalid: 'pages.uploadTooLarge',
        upload_too_large: 'pages.uploadTooLarge',
        unsupported_input: 'pages.uploadInvalidType',
        unsupported_media_type: 'pages.uploadInvalidType',
        document_parse_timeout: 'errors.document_parse_timeout',
        network_error: 'errors.network_error',
      };
      setUploadError(error instanceof ApiError ? messages[error.code] ?? 'pages.loadError' : 'pages.loadError');
    }
    finally { setBusy(false); }
  }
  async function savePreferences() {
    setSaveError(false);
    try { await sendJson(`/projects/${projectId}/preferences`, 'PATCH', { output_language: language, notifications_enabled: notifications }); setLanguageDraft(''); setNotificationsDraft(''); preferences.reload(); }
    catch { setSaveError(true); }
  }
  return <section className="page-wrap"><PageBack to={`/app/projects/${projectId}/overview`}>{t('nav.overview')}</PageBack><div className="page-heading"><div><h1>{t('pages.profileTitle', { defaultValue: 'Profile and CV' })}</h1><p className="muted">{t('pages.preferencesHeading', { defaultValue: 'Preferences' })}</p></div>{currentSession && <Link className="button button-secondary" to={`/app/projects/${projectId}/sessions/${currentSession.id}`}>{t('pages.sessions', { defaultValue: 'Sessions' })}: {currentSession.title}</Link>}</div>
    {state?.initialGoal && <p className="notice">{t('pages.goal', { defaultValue: 'Goal' })}: {state.initialGoal}</p>}
    <form className="surface-card" onSubmit={event => { event.preventDefault(); if (sessionBusy || !sessionTitle.trim()) return; setSessionBusy(true); setSessionError(false); void sendJson<Session>(`/projects/${projectId}/sessions`, 'POST', { title: sessionTitle.trim() }).then(session => { setSessionTitle(''); navigate(`/app/projects/${projectId}/sessions/${session.id}`); }).catch(() => setSessionError(true)).finally(() => setSessionBusy(false)); }}><h2>{t('workflow.newSession')}</h2><label htmlFor="session-title">{t('workflow.sessionTitle')}</label><input id="session-title" maxLength={200} value={sessionTitle} onChange={event => setSessionTitle(event.target.value)} required />{sessionError && <p role="alert">{t('pages.loadError')}</p>}<Button variant="primary" type="submit" disabled={sessionBusy || !sessionTitle.trim()}>{t('workflow.newSession')}</Button></form>
    <section className="surface-card"><h2>{t('pages.cvHeading', { defaultValue: 'Your CV' })}</h2>{cv.data?.length ? <ul className="revision-list">{cv.data.map(revision => <li key={revision.id}>{revision.original_filename ?? `${t('pages.revision', { defaultValue: 'Revision' })} ${revision.revision}`}</li>)}</ul> : <><h3>{t('pages.noCVTitle', { defaultValue: 'No CV added yet' })}</h3><p className="muted">{t('pages.noCVDescription', { defaultValue: 'Paste CV text or select a PDF, DOCX or text file to add a revision.' })}</p></>}
      <label htmlFor="cv-text">{t('pages.pasteCV', { defaultValue: 'Paste CV text' })}</label><textarea id="cv-text" rows={8} value={text} onChange={event => setText(event.target.value)} />
      <label htmlFor="cv-file">{t('pages.uploadCV', { defaultValue: 'Upload a CV file' })}</label><input id="cv-file" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={event => setFile(event.target.files?.[0])} />{file && <p className="muted" role="status">{t('pages.selectedFile', { defaultValue: 'Selected file' })}: {file.name}</p>}
      {uploadError && <p className="field-error" role="alert">{t(uploadError)}</p>}<Button variant="primary" disabled={busy || (!file && !text.trim())} onClick={() => void upload()}>{t('pages.save', { defaultValue: 'Save' })}</Button>
    </section>
    <section className="surface-card"><h2>{t('pages.preferencesHeading', { defaultValue: 'Preferences' })}</h2><label htmlFor="output-language">{t('pages.outputLanguage', { defaultValue: 'Document language' })}</label><select id="output-language" value={language} onChange={event => setLanguageDraft(event.target.value)}><option value="th">ไทย</option><option value="en">English</option></select><label className="check-row"><input type="checkbox" checked={notifications} onChange={event => setNotificationsDraft(String(event.target.checked))} />{t('pages.notifications', { defaultValue: 'Notifications' })}</label>{saveError && <p className="field-error" role="alert">{t('pages.loadError', { defaultValue: 'We could not load this information.' })}</p>}<Button variant="primary" onClick={() => void savePreferences()}>{t('pages.savePreferences', { defaultValue: 'Save preferences' })}</Button></section>
  </section>;
}
