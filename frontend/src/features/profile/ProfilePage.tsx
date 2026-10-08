import { useRef, useState } from 'react';
import { CvPreviewButton } from '@/components/CvPreview';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Plus, Star, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog';
import { PageBack } from '../../components/PageBack';
import { useDraft } from '../../app/drafts';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { apiRequest } from '../../lib/api';
import { ApiError, type CVView } from '../../lib/api-types';
import { sendJson, useResource } from '../projects/useResource';

type Preferences = { project_id: string; output_language: 'th' | 'en'; notifications_enabled: boolean };

const copy = {
  th: { subtitle: 'จัดการ CV หลายฉบับและค่ากำหนดของเอกสาร', cvs: 'CV ของคุณ', add: 'เพิ่ม CV', primary: 'หลัก', version: 'เวอร์ชัน', versions: 'เวอร์ชันทั้งหมด', upload: 'อัปโหลดเวอร์ชันใหม่', makePrimary: 'ตั้งเป็น CV หลัก', rename: 'เปลี่ยนชื่อ', delete: 'ลบ', empty: 'ยังไม่มี CV', emptyBody: 'เลือกไฟล์ PDF, DOCX หรือ TXT (ไม่เกิน 20 MB) เพื่อเพิ่ม CV ชื่อจะตั้งจากชื่อไฟล์ แก้ไขได้ภายหลัง', inUse: 'ลบไม่ได้ เพราะมีเซสชันใช้ CV นี้อยู่', delTitle: (n: string) => `ลบ CV “${n}”?`, delBody: 'CV นี้และทุกเวอร์ชันจะถูกลบ ย้อนกลับไม่ได้', cancel: 'ยกเลิก', save: 'บันทึก', name: 'ชื่อ CV', renameTitle: 'เปลี่ยนชื่อ CV', failed: 'ดำเนินการไม่สำเร็จ ลองอีกครั้ง', docSettings: 'การตั้งค่าเอกสาร', notifyHint: 'แจ้งเตือนเมื่องานของเอเจนต์เสร็จหรือรออนุมัติ' },
  en: { subtitle: 'Manage several CVs and document preferences', cvs: 'Your CVs', add: 'Add CV', primary: 'Primary', version: 'Version', versions: 'versions', upload: 'Upload new version', makePrimary: 'Set as primary', rename: 'Rename', delete: 'Delete', empty: 'No CV yet', emptyBody: 'Choose a PDF, DOCX or TXT file (up to 20 MB) to add a CV. The name comes from the file name and can be changed later.', inUse: 'Cannot delete: a session uses this CV.', delTitle: (n: string) => `Delete CV “${n}”?`, delBody: 'This CV and all its versions are deleted. This cannot be undone.', cancel: 'Cancel', save: 'Save', name: 'CV name', renameTitle: 'Rename CV', failed: 'That did not work. Try again.', docSettings: 'Document settings', notifyHint: 'Tell me when an agent task finishes or needs approval' },
};
const selectClass = 'flex min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
const formatSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const uploadMessages: Record<string, string> = {
  scanned_pdf_unsupported: 'errors.scanned_pdf_unsupported', document_encrypted: 'errors.document_encrypted', document_invalid: 'errors.document_invalid', empty_input: 'errors.empty_input',
  document_expansion_limit: 'errors.document_limits', extracted_text_limit: 'errors.document_limits', input_size_invalid: 'pages.uploadTooLarge', upload_too_large: 'pages.uploadTooLarge',
  unsupported_input: 'pages.uploadInvalidType', unsupported_media_type: 'pages.uploadInvalidType', document_parse_timeout: 'errors.document_parse_timeout', network_error: 'errors.network_error',
};
const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

function RenameDialog({ cv, c, projectId, onClose, onDone }: { cv: CVView; c: typeof copy.en; projectId: string; onClose: () => void; onDone: () => void }) {
  const [value, setValue] = useState(cv.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function submit() {
    const next = value.trim();
    if (busy || !next) return;
    if (next === cv.name) { onClose(); return; }
    setBusy(true); setError(false);
    try { await sendJson(`/projects/${projectId}/cvs/${cv.id}`, 'PATCH', { name: next }); onDone(); } catch { setError(true); setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent aria-describedby={undefined}>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <DialogTitle>{c.renameTitle}</DialogTitle>
      <label className="grid gap-1.5 text-sm font-medium">{c.name}<Input autoFocus maxLength={120} value={value} onChange={event => setValue(event.target.value)} onFocus={event => event.currentTarget.select()} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{c.failed}</p>}
      <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="outline" disabled={busy}>{c.cancel}</Button></DialogClose><Button type="submit" disabled={busy || !value.trim()}>{c.save}</Button></div>
    </form>
  </DialogContent></Dialog>;
}

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const locale: 'th' | 'en' = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const { projectId = '' } = useParams();
  const cvs = useResource<CVView[]>(`/projects/${projectId}/cvs`);
  const preferences = useResource<Preferences>(`/projects/${projectId}/preferences`);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rename, setRename] = useState<CVView | null>(null);
  const [remove, setRemove] = useState<CVView | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const versionTarget = useRef<string>('');
  const versionInput = useRef<HTMLInputElement>(null);
  const [languageDraft, setLanguageDraft] = useDraft(projectId, 'profile', 'output-language');
  const [notificationsDraft, setNotificationsDraft] = useDraft(projectId, 'profile', 'notifications');
  const language: 'th' | 'en' = languageDraft === 'th' || languageDraft === 'en' ? languageDraft : preferences.data?.output_language ?? 'th';
  const notifications = notificationsDraft ? notificationsDraft === 'true' : preferences.data?.notifications_enabled ?? true;
  const [saveError, setSaveError] = useState(false);
  if (cvs.status === 'loading' && !cvs.data || preferences.status === 'loading' && !preferences.data) return <LoadingState />;
  if (cvs.status === 'error' || preferences.status === 'error') return <ErrorState onRetry={() => { cvs.reload(); preferences.reload(); }} />;

  async function upload(file: File | undefined, path: string, name?: string) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setUploadError('pages.uploadTooLarge'); return; }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['pdf', 'docx', 'txt'].includes(extension)) { setUploadError('pages.uploadInvalidType'); return; }
    setBusy(true); setUploadError(null);
    try {
      const body = new FormData(); body.set('file', file); if (name) body.set('name', name);
      await apiRequest(`/projects/${projectId}${path}`, { method: 'POST', body });
      cvs.reload();
    } catch (error) { setUploadError(error instanceof ApiError ? uploadMessages[error.code] ?? 'pages.loadError' : 'pages.loadError'); }
    finally { setBusy(false); }
  }
  async function makePrimary(cv: CVView) {
    setUploadError(null);
    try { await sendJson(`/projects/${projectId}/cvs/${cv.id}`, 'PATCH', { is_primary: true }); cvs.reload(); } catch { setUploadError('pages.loadError'); }
  }
  async function savePreferences() {
    setSaveError(false);
    try { await sendJson(`/projects/${projectId}/preferences`, 'PATCH', { output_language: language, notifications_enabled: notifications }); setLanguageDraft(''); setNotificationsDraft(''); preferences.reload(); }
    catch { setSaveError(true); }
  }
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const base = `/app/projects/${projectId}`;
  const list = cvs.data ?? [];
  return <section className="grid gap-6">
    <PageBack to={`${base}/overview`}>{t('nav.overview')}</PageBack>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h1 className="break-words text-2xl font-semibold">{t('pages.profileTitle', { defaultValue: 'Profile and CV' })}</h1><p className="text-sm text-muted-foreground">{c.subtitle}</p></div>
      <Button disabled={busy} onClick={() => addInput.current?.click()}><Plus className="size-4" aria-hidden="true" />{c.add}</Button>
      <input ref={addInput} className="sr-only" tabIndex={-1} aria-label={c.add} type="file" accept={ACCEPT} onChange={event => { void upload(event.target.files?.[0], '/cvs'); event.target.value = ''; }} />
      <input ref={versionInput} className="sr-only" tabIndex={-1} aria-label={c.upload} type="file" accept={ACCEPT} onChange={event => { void upload(event.target.files?.[0], `/cvs/${versionTarget.current}/revisions`); event.target.value = ''; }} />
    </div>
    {uploadError && <p className="text-sm text-destructive" role="alert">{t(uploadError)}</p>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        <h2 className="text-lg font-semibold">{c.cvs}</h2>
        {list.length === 0 ? <div className="flex flex-col items-start gap-1 rounded-lg border border-dashed p-4"><h3 className="font-medium">{c.empty}</h3><p className="text-sm text-muted-foreground">{c.emptyBody}</p></div>
          : <ul className="grid gap-3">{list.map(cv => <li key={cv.id}><Card><CardContent className="grid gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2"><h3 className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{cv.name}</h3>{cv.is_primary && <Badge variant="success"><Star className="me-1 size-3" aria-hidden="true" />{c.primary}</Badge>}</div>
              <div className="flex gap-1"><Button type="button" size="sm" variant="ghost" onClick={() => setRename(cv)}>{c.rename}</Button>
                <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={cv.in_use} title={cv.in_use ? c.inUse : undefined} onClick={() => setRemove(cv)}>{c.delete}</Button></div>
            </div>
            {cv.latest_revision && <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{c.version} {cv.latest_revision.revision} · {cv.latest_revision.original_filename} · {date.format(new Date(cv.latest_revision.created_at))} · {formatSize(cv.latest_revision.size_bytes)} · {cv.revision_count} {c.versions}</p>}
            {cv.in_use && <p className="text-xs text-muted-foreground">{c.inUse}</p>}
            <div className="flex flex-wrap gap-2">
              {cv.latest_revision && <CvPreviewButton projectId={projectId} fileId={cv.latest_revision.file_id} name={cv.name} revision={cv.latest_revision.revision} filename={cv.latest_revision.original_filename} mimeType={cv.latest_revision.mime_type} variant="default" />}
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { versionTarget.current = cv.id; versionInput.current?.click(); }}><Upload className="size-4" aria-hidden="true" />{c.upload}</Button>
              {!cv.is_primary && <Button type="button" size="sm" variant="ghost" onClick={() => void makePrimary(cv)}>{c.makePrimary}</Button>}
            </div>
          </CardContent></Card></li>)}</ul>}
      </div>
      <Card className="lg:self-start">
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
    </div>
    {rename && <RenameDialog key={rename.id} cv={rename} c={c} projectId={projectId} onClose={() => setRename(null)} onDone={() => { setRename(null); cvs.reload(); }} />}
    {remove && <ConfirmDeleteDialog title={c.delTitle(remove.name)} description={c.delBody} confirmLabel={c.delete} errors={{ cv_in_use: c.inUse }}
      onConfirm={() => apiRequest(`/projects/${projectId}/cvs/${remove.id}`, { method: 'DELETE' }).then(() => undefined)} onDone={() => { setRemove(null); cvs.reload(); }} onClose={() => setRemove(null)} />}
  </section>;
}
