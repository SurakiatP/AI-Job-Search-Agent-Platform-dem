import { BusyNote } from '@/components/BusyNote';
import { useRunGate } from '../../lib/accountGate';
import { useEffect, useRef, useState } from 'react';
import { CvPreviewButton } from '@/components/CvPreview';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, FileText, MoreHorizontal, Pencil, Plus, Star, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog';
import { PageBack } from '../../components/PageBack';
import { cn } from '@/lib/utils';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { apiRequest } from '../../lib/api';
import { ApiError, type CVRevisionInfo, type CVView, type ExperienceView } from '../../lib/api-types';
import { ExperienceBank } from './ExperienceBank';
import { sendJson, useResource } from '../projects/useResource';

const copy = {
  th: { cvs: 'CV ของคุณ', add: 'เพิ่ม CV', primary: 'หลัก', version: 'เวอร์ชัน', versions: 'เวอร์ชันทั้งหมด', upload: 'อัปโหลดเวอร์ชันใหม่', makePrimary: 'ตั้งเป็น CV หลัก', rename: 'เปลี่ยนชื่อ', delete: 'ลบ', inUse: 'มีเซสชันใช้ CV นี้อยู่ ลบแล้วเซสชันเหล่านั้นยังเปิดดูได้', delTitle: (n: string) => `ลบ CV “${n}”?`, delBody: 'CV นี้จะหายจากรายการและเลือกจับคู่ไม่ได้อีก เซสชันที่เคยใช้ CV นี้ยังเปิดดูผลและเอกสารได้ตามเดิม', cancel: 'ยกเลิก', save: 'บันทึก', name: 'ชื่อ CV', renameTitle: 'เปลี่ยนชื่อ CV', failed: 'ดำเนินการไม่สำเร็จ ลองอีกครั้ง' },
  en: { cvs: 'Your CVs', add: 'Add CV', primary: 'Primary', version: 'Version', versions: 'versions', upload: 'Upload new version', makePrimary: 'Make primary', rename: 'Rename', delete: 'Delete', inUse: 'Sessions use this CV; they stay viewable after deletion.', delTitle: (n: string) => `Delete CV “${n}”?`, delBody: 'This CV leaves the list and can no longer be paired. Sessions that used it keep their results and documents.', cancel: 'Cancel', save: 'Save', name: 'CV name', renameTitle: 'Rename CV', failed: 'That did not work. Try again.' },
};
const formatSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const fileType = (filename: string) => filename.split('.').pop()?.toUpperCase() ?? '';
const uploadMessages: Record<string, string> = {
  scanned_pdf_unsupported: 'errors.scanned_pdf_unsupported', document_encrypted: 'errors.document_encrypted', document_invalid: 'errors.document_invalid', empty_input: 'errors.empty_input',
  document_expansion_limit: 'errors.document_limits', extracted_text_limit: 'errors.document_limits', input_size_invalid: 'pages.uploadTooLarge', upload_too_large: 'pages.uploadTooLarge',
  unsupported_input: 'pages.uploadInvalidType', unsupported_media_type: 'pages.uploadInvalidType', document_parse_timeout: 'errors.document_parse_timeout', network_error: 'errors.network_error',
};
const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
const ROW_GRID = 'xl:grid-cols-[minmax(0,1fr)_9rem_4.5rem_28rem]';

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

// Row menu: Make primary (with what it changes), Rename, Delete.
function CvRowMenu({ cv, c, label, help, onMakePrimary, onRename, onDelete }: { cv: CVView; c: typeof copy.en; label: string; help: string; onMakePrimary: () => void; onRename: () => void; onDelete: () => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={label} className="grid size-11 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"><MoreHorizontal className="size-4" aria-hidden="true" /></button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-64">
      {!cv.is_primary && <DropdownMenuItem className="h-auto flex-col items-start gap-0.5" onSelect={onMakePrimary}>
        <span className="flex items-center gap-2"><Star className="size-4" aria-hidden="true" />{c.makePrimary}</span>
        <span className="ps-6 text-xs text-muted-foreground">{help}</span>
      </DropdownMenuItem>}
      <DropdownMenuItem onSelect={onRename}><Pencil className="size-4" aria-hidden="true" />{c.rename}</DropdownMenuItem>
      <DropdownMenuItem className="text-destructive data-[highlighted]:text-destructive" onSelect={onDelete}><Trash2 className="size-4" aria-hidden="true" />{c.delete}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

// Earlier uploads of the primary CV (the API lists revisions for the primary CV only).
function VersionHistory({ projectId, cv, revisions, date, label, versionLabel }: { projectId: string; cv: CVView; revisions: CVRevisionInfo[]; date: Intl.DateTimeFormat; label: string; versionLabel: (n: number) => string }) {
  return <ol aria-label={label} className="grid gap-1 rounded-lg bg-muted/50 p-2 xl:col-span-full">{revisions.map(revision => <li key={revision.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1 text-sm">
    <span className="min-w-0 break-words text-muted-foreground [overflow-wrap:anywhere]"><span className="font-medium text-foreground">{versionLabel(revision.revision)}</span> · {revision.original_filename} · {date.format(new Date(revision.created_at))} · {formatSize(revision.size_bytes)}</span>
    <CvPreviewButton projectId={projectId} fileId={revision.file_id} name={cv.name} revision={revision.revision} filename={revision.original_filename} mimeType={revision.mime_type} variant="ghost" />
  </li>)}</ol>;
}

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const gate = useRunGate();
  const locale: 'th' | 'en' = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const w = (key: string, options?: Record<string, unknown>) => t(`profile.${key}`, { ns: 'materialsWorkspace', ...options });
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'experience' ? 'experience' : 'library';
  const showTab = (next: string) => setParams(next === 'experience' ? { tab: 'experience' } : {}, { replace: true });
  const cvs = useResource<CVView[]>(`/projects/${projectId}/cvs`);
  const primaryRevisions = useResource<CVRevisionInfo[]>(`/projects/${projectId}/cv`);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rename, setRename] = useState<CVView | null>(null);
  const [remove, setRemove] = useState<CVView | null>(null);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const versionTarget = useRef<string>('');
  const versionInput = useRef<HTMLInputElement>(null);
  const [extractError, setExtractError] = useState(false);
  const bank = useResource<ExperienceView>(`/projects/${projectId}/experience`);
  const extractionStatus = bank.data?.extraction?.status;
  const extracting = extractionStatus === 'queued' || extractionStatus === 'running';
  // A new CV revision queues an extraction server-side; refresh the bank whenever the revisions change.
  const revisionKey = cvs.data?.map(cv => cv.latest_revision?.id ?? '').join() ?? null;
  const seenRevisionKey = useRef<string | null>(null);
  const reloadBank = bank.reload;
  useEffect(() => {
    if (revisionKey === null) return;
    if (seenRevisionKey.current !== null && seenRevisionKey.current !== revisionKey) reloadBank();
    seenRevisionKey.current = revisionKey;
  }, [revisionKey, reloadBank]);
  useEffect(() => { if (!extracting) return; const timer = window.setInterval(reloadBank, 3000); return () => window.clearInterval(timer); }, [extracting, reloadBank]);
  if (cvs.status === 'loading' && !cvs.data) return <LoadingState />;
  if (cvs.status === 'error') return <ErrorState onRetry={cvs.reload} />;

  async function upload(file: File | undefined, path: string, name?: string) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setUploadError('pages.uploadTooLarge'); return; }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['pdf', 'docx', 'txt'].includes(extension)) { setUploadError('pages.uploadInvalidType'); return; }
    setBusy(true); setUploadError(null);
    try {
      const body = new FormData(); body.set('file', file); if (name) body.set('name', name);
      await apiRequest(`/projects/${projectId}${path}`, { method: 'POST', body });
      cvs.reload(); primaryRevisions.reload();
    } catch (error) { setUploadError(error instanceof ApiError ? uploadMessages[error.code] ?? 'pages.loadError' : 'pages.loadError'); }
    finally { setBusy(false); }
  }
  async function makePrimary(cv: CVView) {
    setUploadError(null);
    try { await sendJson(`/projects/${projectId}/cvs/${cv.id}`, 'PATCH', { is_primary: true }); cvs.reload(); primaryRevisions.reload(); } catch { setUploadError('pages.loadError'); }
  }
  async function extract(cv: CVView) {
    setExtractError(false);
    try { await apiRequest(`/projects/${projectId}/cvs/${cv.id}/experience-runs`, { method: 'POST' }); bank.reload(); } catch { setExtractError(true); }
  }
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const base = `/app/projects/${projectId}`;
  const list = cvs.data ?? [];
  const primary = list.find(cv => cv.is_primary);
  const history = primaryRevisions.status === 'ready' ? primaryRevisions.data ?? [] : [];
  const factCount = bank.data?.items.length;
  const versionLabel = (n: number) => w('versionShort', { n });
  const dropProps = { onDragOver: (event: React.DragEvent) => { event.preventDefault(); setDragging(true); }, onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files[0], '/cvs'); } };
  return <section className="grid gap-6 lg:gap-8">
    <PageBack to={`${base}/overview`}>{t('nav.overview')}</PageBack>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h1 className="break-words text-2xl font-semibold">{w('title')}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{w('subtitle')}</p></div>
      <Button className="min-h-11" busy={busy} disabled={busy} onClick={() => addInput.current?.click()}><Plus className="size-4" aria-hidden="true" />{c.add}</Button>
      <input ref={addInput} className="sr-only" tabIndex={-1} aria-label={c.add} type="file" accept={ACCEPT} onChange={event => { void upload(event.target.files?.[0], '/cvs'); event.target.value = ''; }} />
      <input ref={versionInput} className="sr-only" tabIndex={-1} aria-label={c.upload} type="file" accept={ACCEPT} onChange={event => { void upload(event.target.files?.[0], `/cvs/${versionTarget.current}/revisions`); event.target.value = ''; }} />
    </div>
    {busy && <p role="status" className="text-sm text-muted-foreground">{w('uploading')}</p>}
    {uploadError && <p className="text-sm text-destructive" role="alert">{t(uploadError)}</p>}
    {extractError && <p className="text-sm text-destructive" role="alert">{c.failed}</p>}
    <Tabs value={tab} onValueChange={showTab}>
      <TabsList className="w-full justify-start sm:w-auto">
        <TabsTrigger className="min-h-11 grow sm:grow-0" value="library">{w('tabLibrary')}</TabsTrigger>
        <TabsTrigger className="min-h-11 grow sm:grow-0" value="experience">{w('tabBank')}</TabsTrigger>
      </TabsList>
      <TabsContent value="library" className="grid gap-6">
        {list.length === 0 ? <div {...dropProps} className={cn('grid justify-items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center sm:p-12', dragging && 'border-primary bg-accent')}>
          <FileText className="size-10 text-muted-foreground" aria-hidden="true" />
          <div className="grid gap-1"><h2 className="text-lg font-semibold">{dragging ? w('dropActive') : w('dropTitle')}</h2><p className="mx-auto max-w-md text-sm text-muted-foreground">{w('firstUploadHelp')}</p></div>
          <Button type="button" className="min-h-11" busy={busy} disabled={busy} onClick={() => addInput.current?.click()}><Upload className="size-4" aria-hidden="true" />{w('firstUpload')}</Button>
          <p className="text-sm text-muted-foreground">{w('dropHere')} · {w('accepted')}</p>
        </div>
          : <Card><CardContent className="grid gap-3 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">{c.cvs}</h2>
            <div aria-hidden="true" className={cn('hidden gap-3 border-b px-1 pb-2 text-sm font-medium text-muted-foreground xl:grid', ROW_GRID)}><span>{w('colName')}</span><span>{w('colVersion')}</span><span>{w('colType')}</span><span className="text-end">{w('colActions')}</span></div>
            <ul className="grid divide-y">{list.map(cv => {
              const latest = cv.latest_revision;
              const showHistory = cv.is_primary && history.length > 1;
              return <li key={cv.id} className={cn('grid gap-3 px-1 py-4', ROW_GRID, 'xl:items-center')}>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2"><h3 className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">{cv.name}</h3>{cv.is_primary && <Badge variant="success"><Star className="me-1 size-3" aria-hidden="true" />{c.primary}</Badge>}</div>
                  {latest && <p className="mt-0.5 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{latest.original_filename} · {date.format(new Date(latest.created_at))} · {formatSize(latest.size_bytes)}</p>}
                  {cv.in_use && <p className="mt-0.5 text-xs text-muted-foreground">{c.inUse}</p>}
                </div>
                <p className="text-sm"><span className="text-muted-foreground xl:hidden">{w('colVersion')}: </span>{latest ? <>{versionLabel(latest.revision)}{cv.revision_count > 1 && <span className="text-muted-foreground"> · {cv.revision_count} {c.versions}</span>}</> : '—'}</p>
                <p className="text-sm"><span className="text-muted-foreground xl:hidden">{w('colType')}: </span>{latest ? fileType(latest.original_filename) : '—'}</p>
                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  {latest && <CvPreviewButton projectId={projectId} fileId={latest.file_id} name={cv.name} revision={latest.revision} filename={latest.original_filename} mimeType={latest.mime_type} className="min-h-11" />}
                  <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => { versionTarget.current = cv.id; versionInput.current?.click(); }}><Upload className="size-4" aria-hidden="true" />{c.upload}</Button>
                  {latest && bank.data?.provider_configured && <Button type="button" size="sm" variant="outline" className="min-h-11" aria-label={`${w('extractFacts')}: ${cv.name}`} disabled={gate.blocked} title={gate.title} onClick={() => void extract(cv)}>{w('extractFacts')}</Button>}
                  <CvRowMenu cv={cv} c={c} label={w('rowMenu', { name: cv.name })} help={w('makePrimaryHelp')} onMakePrimary={() => void makePrimary(cv)} onRename={() => setRename(cv)} onDelete={() => setRemove(cv)} />
                </div>
                {showHistory && <div className="grid gap-2 xl:col-span-full">
                  <Button type="button" size="sm" variant="ghost" className="min-h-11 w-fit" aria-expanded={historyOpen === cv.id} onClick={() => setHistoryOpen(historyOpen === cv.id ? null : cv.id)}>
                    {historyOpen === cv.id ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}{historyOpen === cv.id ? w('versionsClose') : w('versionsOpen', { count: history.length })}</Button>
                  {historyOpen === cv.id && <VersionHistory projectId={projectId} cv={cv} revisions={history} date={date} label={w('versionHistory')} versionLabel={versionLabel} />}
                </div>}
              </li>;
            })}</ul>
            <p className="border-t pt-3 text-sm text-muted-foreground">{w('primaryNote')}</p>
          </CardContent></Card>}
        <Card><CardContent className="grid gap-2 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><h2 className="text-lg font-semibold">{w('bankTitle')}</h2>
              {bank.data && <p className="text-sm"><span className="font-medium">{w('bankCount', { count: factCount })}</span> <span className="text-muted-foreground">{factCount ? w('bankFrom') : w('bankNone')}</span></p>}
              {extracting && <BusyNote bar label={w('bankRunning')} />}
              {extractionStatus && ['failed', 'interrupted', 'cancelled'].includes(extractionStatus) && <p role="status" className="text-sm text-destructive">{w('bankFailed')}</p>}</div>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => showTab('experience')}>{w('bankReview')}</Button>
          </div>
        </CardContent></Card>
        <p className="text-sm text-muted-foreground"><Link className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to={`/app/settings?project=${projectId}&section=preferences`}>{w('prefsMoved')}</Link></p>
      </TabsContent>
      <TabsContent value="experience">
        <ExperienceBank projectId={projectId} locale={locale} bank={bank} primaryCvId={primary?.id ?? list[0]?.id ?? null} />
      </TabsContent>
    </Tabs>
    {rename && <RenameDialog key={rename.id} cv={rename} c={c} projectId={projectId} onClose={() => setRename(null)} onDone={() => { setRename(null); cvs.reload(); }} />}
    {remove && <ConfirmDeleteDialog title={c.delTitle(remove.name)} description={c.delBody} confirmLabel={c.delete} errors={{ cv_in_use: c.inUse }}
      onConfirm={() => apiRequest(`/projects/${projectId}/cvs/${remove.id}`, { method: 'DELETE' }).then(() => undefined)} onDone={() => { setRemove(null); cvs.reload(); primaryRevisions.reload(); }} onClose={() => setRemove(null)} />}
  </section>;
}
