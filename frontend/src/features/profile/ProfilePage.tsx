import { BusyNote } from '@/components/BusyNote';
import { useRunGate } from '../../lib/accountGate';
import { useEffect, useRef, useState } from 'react';
import { CvPreviewButton } from '@/components/CvPreview';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronDown, ChevronUp, FileText, MoreHorizontal, Pencil, Plus, Star, Trash2, Upload, Sparkles, UserRound, X } from 'lucide-react';
import { notifyTrashChanged } from '@/lib/trash';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog';
import { cn } from '@/lib/utils';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { apiRequest } from '../../lib/api';
import { ApiError, type CVRevisionInfo, type CVView, type ExperienceView } from '../../lib/api-types';
import { ExperienceBank } from './ExperienceBank';
import { sendJson, useResource } from '../projects/useResource';
import { BuildCvButton } from '../builder/BuildCvButton';
import { PageHeader } from '@/components/PageHeader';
import { dateLocale } from '../../lib/locale';

const copy = {
  th: { editBuilder: 'แก้ไขในตัวสร้าง', cvs: 'CV ของคุณ', add: 'เพิ่ม CV', primary: 'หลัก', version: 'เวอร์ชัน', versions: 'เวอร์ชันทั้งหมด', upload: 'อัปโหลดเวอร์ชันใหม่', makePrimary: 'ตั้งเป็น CV หลัก', rename: 'เปลี่ยนชื่อ', delete: 'ลบ', inUse: 'มีเซสชันใช้ CV นี้อยู่ ลบแล้วเซสชันเหล่านั้นยังเปิดดูได้', delTitle: (n: string) => `ย้าย CV “${n}” ไปถังขยะ?`, delBody: 'CV นี้จะหายจากรายการและเลือกจับคู่ไม่ได้ จนกว่าจะกู้คืนจากถังขยะ การประเมินที่เคยใช้ CV นี้ยังเปิดดูผลและเอกสารได้ตามเดิม', delConfirm: 'ย้ายไปถังขยะ', moved: (n: string) => `ย้าย “${n}” ไปถังขยะแล้ว`, undo: 'เลิกทำ', undoFailed: 'เลิกทำไม่สำเร็จ กู้คืนได้จากถังขยะ', openTrash: 'เปิดถังขยะ', dismiss: 'ปิด', cancel: 'ยกเลิก', save: 'บันทึก', name: 'ชื่อ CV', renameTitle: 'เปลี่ยนชื่อ CV', failed: 'ดำเนินการไม่สำเร็จ ลองอีกครั้ง' },
  en: { editBuilder: 'Edit in builder', cvs: 'Your CVs', add: 'Add CV', primary: 'Primary', version: 'Version', versions: 'versions', upload: 'Upload new version', makePrimary: 'Make primary', rename: 'Rename', delete: 'Delete', inUse: 'Sessions use this CV; they stay viewable after deletion.', delTitle: (n: string) => `Move CV “${n}” to the trash?`, delBody: 'This CV leaves the list and cannot be paired until you restore it from the trash. Evaluations that used it keep their results and documents.', delConfirm: 'Move to trash', moved: (n: string) => `“${n}” moved to the trash.`, undo: 'Undo', undoFailed: 'Undo did not work. Restore it from the trash.', openTrash: 'Open trash', dismiss: 'Dismiss', cancel: 'Cancel', save: 'Save', name: 'CV name', renameTitle: 'Rename CV', failed: 'That did not work. Try again.' },
};
const formatSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const uploadMessages: Record<string, string> = {
  scanned_pdf_unsupported: 'errors.scanned_pdf_unsupported', document_encrypted: 'errors.document_encrypted', document_invalid: 'errors.document_invalid', empty_input: 'errors.empty_input',
  document_expansion_limit: 'errors.document_limits', extracted_text_limit: 'errors.document_limits', input_size_invalid: 'pages.uploadTooLarge', upload_too_large: 'pages.uploadTooLarge',
  unsupported_input: 'pages.uploadInvalidType', unsupported_media_type: 'pages.uploadInvalidType', document_parse_timeout: 'errors.document_parse_timeout', ocr_unavailable: 'errors.ocr_unavailable', network_error: 'errors.network_error',
};
const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

// Inline rename: Enter or leaving the field saves, Escape cancels.
function InlineName({ cv, c, projectId, onClose, onDone }: { cv: CVView; c: typeof copy.en; projectId: string; onClose: () => void; onDone: () => void }) {
  const [value, setValue] = useState(cv.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const cancelled = useRef(false);
  async function submit() {
    const next = value.trim();
    if (busy || cancelled.current) return;
    if (!next || next === cv.name) { onClose(); return; }
    setBusy(true); setError(false);
    try { await sendJson(`/projects/${projectId}/cvs/${cv.id}`, 'PATCH', { name: next }); onDone(); } catch { setError(true); setBusy(false); }
  }
  return <form className="grid min-w-0 flex-1 gap-1" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <Input autoFocus aria-label={c.name} maxLength={120} value={value} disabled={busy} aria-invalid={error} onChange={event => setValue(event.target.value)} onFocus={event => event.currentTarget.select()} onBlur={() => void submit()}
      onKeyDown={event => { if (event.key === 'Escape') { cancelled.current = true; onClose(); } }} />
    {error && <span role="alert" className="text-sm text-destructive">{c.failed}</span>}
  </form>;
}

// Row menu: Make primary (with what it changes), Rename, Delete.
function CvRowMenu({ cv, c, label, help, onMakePrimary, onRename, onDelete }: { cv: CVView; c: typeof copy.en; label: string; help: string; onMakePrimary: () => void; onRename: () => void; onDelete: () => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={label} className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }), 'text-muted-foreground')}><MoreHorizontal className="size-4" aria-hidden="true" /></button>
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
    <CvPreviewButton projectId={projectId} fileId={revision.file_id} name={cv.name} revision={revision.revision} filename={revision.original_filename} mimeType={revision.mime_type} cvId={cv.id} variant="ghost" />
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
  const [removed, setRemoved] = useState<CVView | null>(null);
  const [undoFailed, setUndoFailed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const versionTarget = useRef<string>('');
  const versionInput = useRef<HTMLInputElement>(null);
  const [extractError, setExtractError] = useState(false);
  const bank = useResource<ExperienceView>(`/projects/${projectId}/experience`);
  const extractionStatus = bank.data?.extraction?.status;
  const [settling, setSettling] = useState(false);
  const extracting = extractionStatus === 'queued' || extractionStatus === 'running' || settling;
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
      // The server queues the read right after the upload; give it a moment before reporting that nothing started.
      setSettling(true); window.setTimeout(reloadBank, 1200); window.setTimeout(() => { reloadBank(); setSettling(false); }, 2500);
    } catch (error) { setUploadError(error instanceof ApiError ? uploadMessages[error.code] ?? 'pages.loadError' : 'pages.loadError'); }
    finally { setBusy(false); }
  }
  async function makePrimary(cv: CVView) {
    setUploadError(null);
    try { await sendJson(`/projects/${projectId}/cvs/${cv.id}`, 'PATCH', { is_primary: true }); cvs.reload(); primaryRevisions.reload(); } catch { setUploadError('pages.makePrimaryError'); }
  }
  async function undo(cv: CVView) {
    try { await apiRequest(`/projects/${projectId}/cvs/${cv.id}/restore`, { method: 'POST' }); setRemoved(null); cvs.reload(); primaryRevisions.reload(); notifyTrashChanged(); }
    catch { setUndoFailed(true); }
  }
  async function extract(cv: CVView) {
    setExtractError(false);
    try { await apiRequest(`/async/projects/${projectId}/cvs/${cv.id}/experience-extractions`, { method: 'POST' }); bank.reload(); } catch { setExtractError(true); }
  }
  const date = new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: 'medium' });
  const dateTime = new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: 'medium', timeStyle: 'short' });
  const base = `/app/projects/${projectId}`;
  const list = cvs.data ?? [];
  const primary = list.find(cv => cv.is_primary);
  const history = primaryRevisions.status === 'ready' ? primaryRevisions.data ?? [] : [];
  const factCount = bank.data?.items.length;
  const skillNames = [...new Set((bank.data?.items ?? []).filter(i => i.kind === 'skill').map(i => i.text.trim()).filter(Boolean))].slice(0, 5);
  const readFailed = !!extractionStatus && ['failed', 'interrupted', 'cancelled'].includes(extractionStatus);
  const notStarted = !!bank.data && !extractionStatus && !factCount && list.length > 0;
  const notStartedWhy = !bank.data?.provider_configured ? w('whyNoProvider') : gate.blocked ? (gate.title ?? w('whyQuota')) : w('whyIdle');
  const retryCv = list.find(cv => cv.id === bank.data?.extraction?.cv_id) ?? primary ?? list[0];
  const versionLabel = (n: number) => w('versionShort', { n });
  const dropProps = { onDragOver: (event: React.DragEvent) => { event.preventDefault(); setDragging(true); }, onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => { event.preventDefault(); setDragging(false); if (!busy) void upload(event.dataTransfer.files[0], '/cvs'); } };
  return <section className="grid gap-6 lg:gap-8">
    <div className="grid gap-1">
    <div className="grid">
      <PageHeader icon={UserRound} title={w('title')} lede={w('subtitle')} actions={list.length === 0 ? undefined : <><Button busy={busy} disabled={busy} onClick={() => addInput.current?.click()}><Plus className="size-4" aria-hidden="true" />{c.add}</Button><BuildCvButton projectId={projectId} /></>} />
      <input ref={addInput} hidden tabIndex={-1} aria-label={c.add} type="file" accept={ACCEPT} onChange={event => { void upload(event.target.files?.[0], '/cvs'); event.target.value = ''; }} />
      <input ref={versionInput} hidden tabIndex={-1} aria-label={c.upload} type="file" accept={ACCEPT} onChange={event => { void upload(event.target.files?.[0], `/cvs/${versionTarget.current}/revisions`); event.target.value = ''; }} />
    </div>
    </div>
    {busy && <p role="status" className="text-sm text-muted-foreground">{w('uploading')}</p>}
    {uploadError && <Alert severity="error" role="alert">{t(uploadError)}</Alert>}
    {extractError && <Alert severity="error" role="alert">{c.failed}</Alert>}
    {removed && <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-4 py-2 text-sm">
      <Trash2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 basis-[calc(100%-2rem)] break-words [overflow-wrap:anywhere] sm:basis-auto">{undoFailed ? c.undoFailed : c.moved(removed.name)}</span>
      <Button type="button" variant="ghost" size="sm" className="max-sm:ml-4" onClick={() => void undo(removed)}>{c.undo}</Button>
      <Link className="inline-flex min-h-11 lg:min-h-10 items-center font-medium text-primary hover:underline" to={`${base}/trash?tab=cvs`}>{c.openTrash}</Link>
      <Button type="button" variant="ghost" size="icon" className="max-sm:ml-auto" aria-label={c.dismiss} onClick={() => setRemoved(null)}><X className="size-4" aria-hidden="true" /></Button>
    </div>}
    <Tabs value={tab} onValueChange={showTab}>
      {list.length > 0 && <TabsList className="w-full justify-start sm:w-auto">
        <TabsTrigger className="grow sm:grow-0" value="library">{w('tabLibrary')}</TabsTrigger>
        <TabsTrigger className="grow sm:grow-0" value="experience">{w('tabBank')}</TabsTrigger>
      </TabsList>}
      <TabsContent value="library" className="grid gap-6">
        {list.length === 0 ? <div {...dropProps} className={cn('grid justify-items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center sm:p-12', dragging && 'border-primary bg-accent')}>
          <FileText className="size-10 text-muted-foreground" aria-hidden="true" />
          <div className="grid gap-1"><h2 className="text-lg font-semibold">{dragging ? w('dropActive') : w('dropTitle')}</h2><p className="mx-auto max-w-md text-sm text-muted-foreground">{w('firstUploadHelp')}</p></div>
          <div className="flex flex-wrap justify-center gap-2"><Button type="button" busy={busy} disabled={busy} onClick={() => addInput.current?.click()}><Upload className="size-4" aria-hidden="true" />{w('firstUpload')}</Button><BuildCvButton projectId={projectId} /></div>
          <p className="text-sm text-muted-foreground">{w('dropHere')} · {w('accepted')}</p>
        </div>
          : <section className="grid gap-3">
            <h2 id="profile-cvs-title" tabIndex={-1} className="text-lg font-semibold">{c.cvs}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[...list].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map(cv => {
              const latest = cv.latest_revision;
              const showHistory = cv.is_primary && history.length > 1;
              const meta = latest
                ? [latest.original_filename, dateTime.format(new Date(latest.created_at)), formatSize(latest.size_bytes)]
                : Number.isNaN(new Date(cv.created_at).getTime()) ? [] : [w('createdAt', { date: dateTime.format(new Date(cv.created_at)) })];
              return <li key={cv.id} className={cn('grid content-start gap-3 rounded-xl border bg-card p-4', cv.is_primary && 'border-primary')}>
                <div className="flex min-w-0 items-start gap-3">
                  <FileText className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">{rename?.id === cv.id ? <InlineName key={cv.id} cv={cv} c={c} projectId={projectId} onClose={() => setRename(null)} onDone={() => { setRename(null); cvs.reload(); }} />
                      : <h3 className="min-w-0 break-words text-base font-semibold [overflow-wrap:anywhere]" title={c.rename} onDoubleClick={() => setRename(cv)}>{cv.name}</h3>}{cv.is_primary && <Badge><Star className="me-1 size-3" aria-hidden="true" />{c.primary}</Badge>}</div>
                    {meta.length > 0 && <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{meta.join(' · ')}</p>}
                    {latest && <p className="text-sm"><span className="text-muted-foreground">{w('colVersion')}: </span>{versionLabel(latest.revision)}{cv.revision_count > 1 && <span className="text-muted-foreground"> · {cv.revision_count} {c.versions}</span>}</p>}
                    {cv.in_use && <p className="mt-1 text-xs text-muted-foreground">{c.inUse}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {latest && <CvPreviewButton projectId={projectId} fileId={latest.file_id} name={cv.name} revision={latest.revision} filename={latest.original_filename} mimeType={latest.mime_type} cvId={cv.id} />}
                  {cv.has_builder_draft
                    ? <Button asChild size="sm" variant="outline"><Link to={`/app/projects/${projectId}/cvs/${cv.id}/builder`}><Pencil className="size-4" aria-hidden="true" />{c.editBuilder}</Link></Button>
                    : <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { versionTarget.current = cv.id; versionInput.current?.click(); }}><Upload className="size-4" aria-hidden="true" />{c.upload}</Button>}
                  {latest && bank.data?.provider_configured && <Button type="button" size="sm" variant="outline" aria-label={`${w('extractFacts')}: ${cv.name}`} disabled={gate.blocked} title={gate.title} onClick={() => void extract(cv)}><Sparkles className="size-4" aria-hidden="true" />{w('extractFacts')}</Button>}
                  <CvRowMenu cv={cv} c={c} label={w('rowMenu', { name: cv.name })} help={w('makePrimaryHelp')} onMakePrimary={() => void makePrimary(cv)} onRename={() => setRename(cv)} onDelete={() => setRemove(cv)} />
                </div>
                {showHistory && <div className="grid gap-2">
                  <Button type="button" size="sm" variant="ghost" className="w-fit" aria-expanded={historyOpen === cv.id} onClick={() => setHistoryOpen(historyOpen === cv.id ? null : cv.id)}>
                    {historyOpen === cv.id ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}{historyOpen === cv.id ? w('versionsClose') : w('versionsOpen', { count: history.length })}</Button>
                  {historyOpen === cv.id && <VersionHistory projectId={projectId} cv={cv} revisions={history} date={date} label={w('versionHistory')} versionLabel={versionLabel} />}
                </div>}
              </li>;
            })}</ul>
            <p className="text-sm text-muted-foreground">{w('primaryNote')}</p>
          </section>}
        {list.length > 0 && <>
          <Card><CardContent className="grid gap-2 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid min-w-0 gap-2" aria-live="polite">
                {extracting && <BusyNote bar label={w('reading')} />}
                {!extracting && bank.data && <p className="flex flex-wrap items-baseline gap-2 text-sm">
                  {readFailed || notStarted ? <span className="font-medium">{readFailed ? w('readFailed') : w('notStarted')}</span> : <><span className="text-xl font-semibold tabular-nums">{factCount}</span><span className="font-medium">{w('readCount', { count: factCount })}</span></>}
                </p>}
                {!extracting && notStarted && <p className="text-sm text-muted-foreground">{notStartedWhy}</p>}
                {!extracting && !notStarted && !readFailed && skillNames.length > 0 && <ul className="flex flex-wrap gap-1">{skillNames.map(name => <li key={name}><Badge variant="muted">{name}</Badge></li>)}</ul>}
              </div>
              {!extracting && (readFailed || notStarted)
                ? retryCv && bank.data?.provider_configured && <Button type="button" className="sm:ms-auto" disabled={gate.blocked} title={gate.title} onClick={() => void extract(retryCv)}><Sparkles className="size-4" aria-hidden="true" />{w('retry')}</Button>
                : !extracting && !!factCount && <Button type="button" variant="outline" className="sm:ms-auto" onClick={() => showTab('experience')}>{w('bankReview')}<ArrowRight className="size-4" aria-hidden="true" /></Button>}
            </div>
          </CardContent></Card>
          <p className="text-sm text-muted-foreground"><Link className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" to={`/app/settings?project=${projectId}&section=preferences`}>{w('prefsMoved')}</Link></p>
        </>}
      </TabsContent>
      <TabsContent value="experience">
        <ExperienceBank projectId={projectId} locale={locale} bank={bank} primaryCvId={primary?.id ?? list[0]?.id ?? null} />
      </TabsContent>
    </Tabs>
    {remove && <ConfirmDeleteDialog title={c.delTitle(remove.name)} description={c.delBody} confirmLabel={c.delConfirm}
      onConfirm={() => apiRequest(`/projects/${projectId}/cvs/${remove.id}`, { method: 'DELETE' }).then(() => undefined)}
      returnFocus={() => document.getElementById('profile-cvs-title')} onDone={() => { setRemoved(remove); setUndoFailed(false); setRemove(null); cvs.reload(); primaryRevisions.reload(); notifyTrashChanged(); }} onClose={() => setRemove(null)} />}
  </section>;
}
