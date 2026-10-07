import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageBack } from '../../components/PageBack';
import { useDraft, useFileDraft } from '../../app/drafts';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { apiRequest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';
import { sendJson, useResource } from '../projects/useResource';

type Revision = { id: string; revision: number; original_filename?: string; mime_type?: string; size_bytes?: number; created_at?: string };
type Preferences = { project_id: string; output_language: 'th' | 'en'; notifications_enabled: boolean };
type Session = { id: string; title: string };

const copy = {
  th: { subtitle: 'จัดการ CV ค่ากำหนด และเริ่มบทสนทนากับเอเจนต์', current: 'ล่าสุด', drop: 'เลือกไฟล์ CV หรือลากมาวางที่นี่', formats: 'รองรับ PDF, DOCX และ TXT ไม่เกิน 20 MB', orPaste: 'หรือวางข้อความ CV', goal: 'เป้าหมาย', docSettings: 'การตั้งค่าเอกสาร', notifyHint: 'แจ้งเตือนเมื่องานของเอเจนต์เสร็จหรือรออนุมัติ', startChat: 'เริ่มบทสนทนา' },
  en: { subtitle: 'Manage your CV, preferences and start a conversation with the agent', current: 'Latest', drop: 'Choose a CV file or drop it here', formats: 'PDF, DOCX or TXT, up to 20 MB', orPaste: 'Or paste CV text', goal: 'Goal', docSettings: 'Document settings', notifyHint: 'Tell me when an agent task finishes or needs approval', startChat: 'Start a conversation' },
};
const selectClass = 'flex min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
const formatSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const locale: 'th' | 'en' = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
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
  const revisions = [...(cv.data ?? [])].sort((a, b) => b.revision - a.revision);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const base = `/app/projects/${projectId}`;
  return <section className="grid gap-6">
    <PageBack to={`${base}/overview`}>{t('nav.overview')}</PageBack>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h1 className="break-words text-2xl font-semibold">{t('pages.profileTitle', { defaultValue: 'Profile and CV' })}</h1><p className="text-sm text-muted-foreground">{c.subtitle}</p></div>
      {currentSession && <Button asChild variant="outline"><Link className="max-w-full" to={`${base}/sessions/${currentSession.id}`}><span className="truncate">{t('pages.sessions', { defaultValue: 'Sessions' })}: {currentSession.title}</span></Link></Button>}
    </div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card className="lg:self-start">
        <CardHeader><CardTitle className="text-lg">{t('pages.cvHeading', { defaultValue: 'Your CV' })}</CardTitle></CardHeader>
        <CardContent className="grid gap-5">
          {revisions.length ? <ul className="revision-list divide-y rounded-lg border">{revisions.map((revision, index) => <li key={revision.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0"><p className="break-words font-medium [overflow-wrap:anywhere]">{revision.original_filename ?? `${t('pages.revision', { defaultValue: 'Revision' })} ${revision.revision}`}</p>
              <p className="text-sm text-muted-foreground">{t('pages.revision', { defaultValue: 'Revision' })} {revision.revision}{revision.created_at ? ` · ${date.format(new Date(revision.created_at))}` : ''}{revision.size_bytes ? ` · ${formatSize(revision.size_bytes)}` : ''}</p></div>
            {index === 0 && <Badge variant="success">{c.current}</Badge>}
          </li>)}</ul> : <div className="flex flex-col items-start gap-1 rounded-lg border border-dashed p-4"><h3 className="font-medium">{t('pages.noCVTitle', { defaultValue: 'No CV added yet' })}</h3><p className="text-sm text-muted-foreground">{t('pages.noCVDescription', { defaultValue: 'Paste CV text or select a PDF, DOCX or text file to add a revision.' })}</p></div>}
          <label htmlFor="cv-file" className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-input px-4 py-8 text-center transition-colors hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <Upload className="size-6 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{t('pages.uploadCV', { defaultValue: 'Upload a CV file' })}</span>
            <span className="text-sm text-muted-foreground">{c.drop} · {c.formats}</span>
            <input id="cv-file" className="sr-only" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={event => setFile(event.target.files?.[0])} />
          </label>
          {file && <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]" role="status">{t('pages.selectedFile', { defaultValue: 'Selected file' })}: {file.name}</p>}
          <details open className="group rounded-lg border">
            <summary className="flex min-h-10 cursor-pointer list-none items-center px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">{c.orPaste}</summary>
            <div className="grid gap-2 border-t px-4 py-4"><label htmlFor="cv-text" className="text-sm font-medium">{t('pages.pasteCV', { defaultValue: 'Paste CV text' })}</label><Textarea id="cv-text" rows={8} value={text} onChange={event => setText(event.target.value)} /></div>
          </details>
          {uploadError && <p className="text-sm text-destructive" role="alert">{t(uploadError)}</p>}
        </CardContent>
        <CardFooter className="justify-end gap-2"><Button disabled={busy || (!file && !text.trim())} onClick={() => void upload()}>{locale === 'th' ? 'บันทึก CV' : t('pages.save', { defaultValue: 'Save' })}</Button></CardFooter>
      </Card>
      <div className="grid gap-6 content-start">
        {state?.initialGoal && <Card>
          <CardHeader><CardTitle className="text-lg">{c.goal}</CardTitle></CardHeader>
          <CardContent><p className="break-words text-sm [overflow-wrap:anywhere]">{state.initialGoal}</p></CardContent>
        </Card>}
        <Card>
          <CardHeader><CardTitle className="text-lg">{c.docSettings}</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5"><label htmlFor="output-language" className="text-sm font-medium">{t('pages.outputLanguage', { defaultValue: 'Document language' })}</label>
              <select id="output-language" className={selectClass} value={language} onChange={event => setLanguageDraft(event.target.value)}><option value="th">ไทย</option><option value="en">English</option></select></div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent">
              <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={notifications} onChange={event => setNotificationsDraft(String(event.target.checked))} />
              <span className="min-w-0"><span className="block text-sm font-medium">{t('pages.notifications', { defaultValue: 'Notifications' })}</span><span className="block text-sm text-muted-foreground">{c.notifyHint}</span></span>
            </label>
            {saveError && <p className="text-sm text-destructive" role="alert">{t('pages.loadError', { defaultValue: 'We could not load this information.' })}</p>}
          </CardContent>
          <CardFooter className="justify-end gap-2"><Button onClick={() => void savePreferences()}>{t('pages.savePreferences', { defaultValue: 'Save preferences' })}</Button></CardFooter>
        </Card>
        <Card>
          <form onSubmit={event => { event.preventDefault(); if (sessionBusy || !sessionTitle.trim()) return; setSessionBusy(true); setSessionError(false); void sendJson<Session>(`/projects/${projectId}/sessions`, 'POST', { title: sessionTitle.trim() }).then(session => { setSessionTitle(''); navigate(`${base}/sessions/${session.id}`); }).catch(() => setSessionError(true)).finally(() => setSessionBusy(false)); }}>
            <CardHeader><CardTitle className="text-lg">{c.startChat}</CardTitle></CardHeader>
            <CardContent className="grid gap-1.5"><label htmlFor="session-title" className="text-sm font-medium">{t('workflow.sessionTitle')}</label><Input id="session-title" maxLength={200} value={sessionTitle} onChange={event => setSessionTitle(event.target.value)} required />
              {sessionError && <p className="text-sm text-destructive" role="alert">{t('pages.loadError')}</p>}</CardContent>
            <CardFooter><Button className="w-full" type="submit" disabled={sessionBusy || !sessionTitle.trim()}>{t('workflow.newSession')}</Button></CardFooter>
          </form>
        </Card>
      </div>
    </div>
  </section>;
}
