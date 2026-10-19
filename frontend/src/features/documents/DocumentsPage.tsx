import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Download, File, FileUser, Info, Mail, MessageSquareText, Pencil, RotateCcw, Trash2, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageBack } from '@/components/PageBack';
import { Markdown } from '@/components/Markdown';
import { CopyButton } from '@/components/CopyButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api-types';
import { apiRequest } from '@/lib/api';
import { useDraft } from '../../app/drafts';
import { cn } from '@/lib/utils';
import type { JobRevisionView, RunView, SessionView } from '@/lib/api-types';
import { ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { sendJson, useResource } from '../projects/useResource';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { DocumentDeleteMenu } from './DocumentDeleteMenu';
import { TrashView, deletePermanently, inUseMessage, permanentDescription, permanentTitle, restoreDocument } from './TrashView';
import { useFilePreview } from '../../components/CvPreview';

type DocumentItem = { id: string; has_builder_draft?: boolean; document_type: 'cv' | 'cover_letter' | 'application_message' | 'other'; title: string; content_markdown?: string | null; output_language?: 'th' | 'en' | null; source_run_id?: string | null; partial?: boolean; trashed_at?: string | null; latest_revision?: { id: string; revision: number } | null };
type DocumentRevision = { document_id: string; id?: string; revision?: number; created_at?: string; source_cv_revision_id?: string | null; source_job_revision_id?: string | null; file_id?: string | null; content_markdown?: string | null; origin?: 'agent' | 'manual' };
type CVRevision = { id: string; revision: number };
type SessionItem = Pick<SessionView, 'id' | 'title' | 'job_title' | 'job_company'>;
type DocType = DocumentItem['document_type'];

const copy = {
  th: { all: 'ทั้งหมด', filter: 'กรองตามประเภท', empty: 'ไม่มีเอกสารในประเภทนี้', evaluate: 'ไปที่หน้าประเมิน', back: 'กลับไปหน้าเอกสาร', type: 'ประเภท', created: 'สร้างเมื่อ', revisions: 'ประวัติฉบับ', current: 'ฉบับปัจจุบัน', metadata: 'รายละเอียด', downloadLatest: 'ดาวน์โหลดฉบับล่าสุด', requestChanges: 'ขอแก้ไข', sourceJob: 'งานต้นทาง', sourceSession: 'เซสชันต้นทาง', sessionDeleted: 'เซสชันถูกลบแล้ว', trash: 'ถังขยะ', trashed: 'ย้ายไปถังขยะแล้ว', undo: 'เลิกทำ', trashFailed: 'ย้ายไปถังขยะไม่สำเร็จ ลองอีกครั้ง', undoFailed: 'กู้คืนไม่สำเร็จ ลองอีกครั้ง', inTrash: 'เอกสารนี้อยู่ในถังขยะ', restore: 'กู้คืน', deleteForever: 'ลบถาวร', edit: 'แก้ไข', editTab: 'แก้ไข', previewTab: 'ดูตัวอย่าง', save: 'บันทึก', cancel: 'ยกเลิก', discard: 'ทิ้งการแก้ไขที่ยังไม่บันทึกหรือไม่?', generating: 'กำลังสร้างไฟล์…', manual: 'แก้เอง', ai: 'AI', editor: 'แก้ไขเอกสาร', retry: 'ลองบันทึกอีกครั้ง', exportFailed: 'สร้างไฟล์ไม่สำเร็จ', saveFailed: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', busyDoc: 'มีงานของเอกสารนี้กำลังทำอยู่ ลองใหม่ภายหลัง', restoreVersion: 'กู้คืนเวอร์ชันนี้', restoring: 'กำลังกู้คืน…', restored: 'กู้คืนแล้ว เวอร์ชันใหม่ถูกสร้างขึ้น', restoreFailed: 'กู้คืนไม่สำเร็จ ลองอีกครั้ง', promote: 'ใช้เป็น CV หลัก', promoteSent: 'ตั้งเอกสารนี้เป็น CV ของคุณแล้ว', promoteFailed: 'ตั้งเป็น CV ไม่สำเร็จ ลองอีกครั้ง', promoteAsk: 'ใช้ฉบับนี้แทน CV ปัจจุบัน?', promoteConfirm: 'ยืนยัน', promoteCancel: 'ยกเลิก', openApprovals: 'เปิดกล่องคำขออนุมัติ', noSource: 'เอกสารนี้ยังไม่มีต้นฉบับสำหรับสร้างไฟล์ ไม่สามารถบันทึกการแก้ไขได้', queueFull: 'คิวงานเต็ม ลองใหม่ภายหลัง', tooLong: 'เนื้อหายาวเกินไปหรือว่างเปล่า' },
  en: { all: 'All', filter: 'Filter by type', empty: 'No documents of this type', evaluate: 'Go to Evaluate', back: 'Back to documents', type: 'Type', created: 'Created', revisions: 'Revisions', current: 'Current', metadata: 'Details', downloadLatest: 'Download latest', requestChanges: 'Request changes', sourceJob: 'Source job', sourceSession: 'Source session', sessionDeleted: 'Session deleted', trash: 'Trash', trashed: 'Moved to trash', undo: 'Undo', trashFailed: 'Could not move to trash. Try again.', undoFailed: 'Could not restore. Try again.', inTrash: 'This document is in the trash', restore: 'Restore', deleteForever: 'Delete permanently', edit: 'Edit', editTab: 'Edit', previewTab: 'Preview', save: 'Save', cancel: 'Cancel', discard: 'Discard unsaved changes?', generating: 'Generating file…', manual: 'Edited by you', ai: 'AI', editor: 'Edit document', retry: 'Try saving again', exportFailed: 'Could not generate the file', saveFailed: 'Could not save. Try again.', busyDoc: 'A task for this document is running. Try again later.', restoreVersion: 'Restore this version', restoring: 'Restoring…', restored: 'Restored. A new version was created.', restoreFailed: 'Could not restore. Try again.', promote: 'Use as my CV', promoteSent: 'This document is now your CV.', promoteFailed: 'Could not set it as your CV. Try again.', promoteAsk: 'Replace your current CV with this version?', promoteConfirm: 'Confirm', promoteCancel: 'Cancel', openApprovals: 'Open the approval inbox', noSource: 'This document has no source to build a file from, so edits cannot be saved.', queueFull: 'The job queue is full. Try again later.', tooLong: 'The content is empty or too long' },
};

const ROW_GRID = 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_6rem_9rem_9rem]';
const typeIcon: Record<DocType, LucideIcon> = { cv: FileUser, cover_letter: Mail, application_message: MessageSquareText, other: File };
const downloadUrl = (projectId: string, fileId: string) => `/api/v1/projects/${projectId}/files/${fileId}/download`;

function documentTypeLabel(type: DocType, t: (key: string, options: { defaultValue: string }) => string) {
  const labels = { cv: ['pages.docTypeCv', 'CV'], cover_letter: ['pages.docTypeCoverLetter', 'Cover letter'], application_message: ['pages.docTypeApplicationMessage', 'Application message'], other: ['pages.docTypeOther', 'Other document'] } as const;
  const [key, fallback] = labels[type];
  return t(key, { defaultValue: fallback });
}

const editErrors: Record<string, 'busyDoc' | 'noSource' | 'queueFull' | 'tooLong'> = { document_busy: 'busyDoc', document_source_unavailable: 'noSource', queue_full: 'queueFull' };

function DocumentEditor({ c, projectId, documentId, initial, onClose, onSaved }: { c: typeof copy.en; projectId: string; documentId: string; initial: string; onClose: () => void; onSaved: () => void }) {
  const [saved, setSaved] = useDraft(projectId, documentId, 'edit');
  const [text, setText] = useState(saved || initial);
  const [phase, setPhase] = useState<'idle' | 'saving' | 'failed'>('idle');
  const [error, setError] = useState('');
  const id = useId();
  const alive = useRef(true);
  const dirty = text !== initial;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!dirty || phase === 'saving') return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, phase]);
  const change = (value: string) => { setText(value); setSaved(value === initial ? '' : value); };
  const cancel = () => { if (dirty && !window.confirm(c.discard)) return; setSaved(''); onClose(); };
  async function save() {
    setPhase('saving'); setError('');
    try {
      const started = await sendJson<RunView>(`/projects/${projectId}/documents/${documentId}/revisions`, 'POST', { content_markdown: text });
      let run = started;
      while (alive.current && (run.status === 'queued' || run.status === 'running' || run.status === 'waiting_approval')) {
        await new Promise(resolve => window.setTimeout(resolve, 1500));
        if (!alive.current) return;
        run = await apiRequest<RunView>(`/projects/${projectId}/runs/${started.id}`);
      }
      if (!alive.current) return;
      if (run.status === 'completed') { setSaved(''); onSaved(); return; }
      setError(c.exportFailed); setPhase('failed');
    } catch (caught) {
      if (!alive.current) return;
      const key = caught instanceof ApiError ? editErrors[caught.code] ?? (caught.status === 422 ? 'tooLong' : undefined) : undefined;
      setError(key ? c[key] : c.saveFailed); setPhase('failed');
    }
  }
  const saving = phase === 'saving';
  return <Card className="min-w-0"><CardContent className="grid gap-4 p-5 sm:p-8">
    <h2 className="font-semibold">{c.editor}</h2>
    <Tabs defaultValue="edit">
      <TabsList><TabsTrigger className="min-h-11" value="edit">{c.editTab}</TabsTrigger><TabsTrigger className="min-h-11" value="preview">{c.previewTab}</TabsTrigger></TabsList>
      <TabsContent value="edit"><label className="sr-only" htmlFor={id}>{c.editor}</label>
        <Textarea id={id} className="min-h-[60vh] resize-y text-base leading-relaxed" value={text} maxLength={200000} disabled={saving} onChange={event => change(event.target.value)} /></TabsContent>
      <TabsContent value="preview"><Markdown className="min-h-[60vh]">{text}</Markdown></TabsContent>
    </Tabs>
    {saving && <p role="status" className="text-sm text-muted-foreground">{c.generating}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={cancel}>{c.cancel}</Button>
      <Button type="button" className="min-h-11" busy={saving} disabled={saving || !text.trim() || !dirty && phase !== 'failed'} onClick={() => void save()}>{phase === 'failed' ? c.retry : c.save}</Button>
    </div>
  </CardContent></Card>;
}

export function DocumentsPage() {
  const { t, i18n } = useTranslation();
  const c = copy[i18n.language.startsWith('th') ? 'th' : 'en'];
  const { projectId = '' } = useParams();
  const base = `/app/projects/${projectId}`;
  const [filter, setFilter] = useState<DocType | 'all'>('all');
  const [params, setParams] = useSearchParams();
  const inTrashView = params.get('view') === 'trash';
  const initialTrashed = (useLocation().state as { trashed?: string } | null)?.trashed;
  const [undo, setUndo] = useState<{ id: string; message: string } | null>(initialTrashed ? { id: initialTrashed, message: c.trashed } : null);
  const result = useResource<DocumentItem[]>(`/projects/${projectId}/documents`);
  const trash = useResource<DocumentItem[]>(`/projects/${projectId}/documents/trash`);
  const sessions = useResource<SessionItem[]>(`/projects/${projectId}/sessions`);
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
  const w = (key: string, options?: Record<string, unknown>) => t(`documents.${key}`, { ns: 'materialsWorkspace', ...options });
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 8000);
    return () => window.clearTimeout(timer);
  }, [undo]);
  if (result.status === 'loading' || trash.status === 'loading' && trash.data === undefined) return <LoadingState />;
  if (result.status === 'error') return <ErrorState onRetry={result.reload} />;
  const documents = result.data ?? [];
  const trashed = trash.data ?? [];
  const reloadAll = () => { result.reload(); trash.reload(); };
  const sessionFor = (document: DocumentItem) => { const id = runs.data?.find(run => run.id === document.source_run_id)?.session_id; return id ? sessions.data?.find(item => item.id === id) : undefined; };
  const evaluateHref = sessions.data?.[0] ? `${base}/sessions/${sessions.data[0].id}` : `${base}/sessions`;
  const title = t('pages.documentsTitle', { defaultValue: 'Documents' });
  // Same header block and rhythm as the populated page; the empty message sits in a card under it.
  if (!documents.length && !trashed.length) return <section className="grid gap-6">
    <PageBack to={`/app/projects/${projectId}/overview`}>{t('nav.overview')}</PageBack>
    <div className="min-w-0"><h1 className="break-words text-2xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{w('subtitle')}</p></div>
    <div className="grid justify-items-start gap-3 rounded-xl border border-dashed bg-card p-4 sm:p-5">
      <h2 className="text-lg font-semibold">{w('emptyTitle')}</h2>
      <p className="text-sm text-muted-foreground">{w('emptyHelp')}</p>
      <Button asChild><Link to={evaluateHref}>{c.evaluate}</Link></Button>
    </div>
  </section>;
  const chips: [DocType | 'all', string][] = [['all', c.all], ['cv', documentTypeLabel('cv', t)], ['cover_letter', documentTypeLabel('cover_letter', t)], ['application_message', documentTypeLabel('application_message', t)], ['other', documentTypeLabel('other', t)]];
  const visible = filter === 'all' ? documents : documents.filter(document => document.document_type === filter);
  const chipClass = (active: boolean) => cn('min-h-10 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', active && 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90');
  const showView = (trashView: boolean) => setParams(trashView ? { view: 'trash' } : {}, { replace: true });
  async function undoTrash() {
    if (!undo) return;
    try { await restoreDocument(projectId, undo.id); setUndo(null); reloadAll(); } catch { setUndo({ id: undo.id, message: c.undoFailed }); }
  }
  return <section className="grid gap-6">
    <PageBack to={`/app/projects/${projectId}/overview`}>{t('nav.overview')}</PageBack>
    <div className="min-w-0"><h1 className="break-words text-2xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{w('subtitle')}</p></div>
    {undo && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted px-4 py-2 text-sm">
      <span>{undo.message}</span>
      {undo.id && <Button type="button" size="sm" variant="outline" onClick={() => { void undoTrash(); }}><RotateCcw className="size-4" aria-hidden="true" />{c.undo}</Button>}
    </div>}
    <div className="flex flex-wrap gap-2" role="group" aria-label={c.filter}>{chips.map(([value, label]) => <button key={value} type="button" aria-pressed={!inTrashView && filter === value}
      className={chipClass(!inTrashView && filter === value)} onClick={() => { setFilter(value); showView(false); }}>{label}</button>)}
      <button type="button" aria-pressed={inTrashView} className={cn(chipClass(inTrashView), 'inline-flex items-center gap-1.5')} onClick={() => showView(true)}><Trash2 className="size-4" aria-hidden="true" />{c.trash} ({trashed.length})</button></div>
    {inTrashView ? <TrashView projectId={projectId} items={trashed} typeLabel={type => documentTypeLabel(type, t)} onChanged={reloadAll} /> :
    visible.length === 0 ? <p className="text-sm text-muted-foreground">{w('emptyFilter')}</p> :
      <div className="rounded-lg border bg-card">
        <div aria-hidden="true" className={cn('hidden gap-4 border-b px-5 py-3 text-sm font-medium text-muted-foreground lg:grid', ROW_GRID)}><span>{w('colDocument')}</span><span>{w('colJob')}</span><span>{w('colVersion')}</span><span>{w('colStatus')}</span><span className="text-end">{w('colActions')}</span></div>
        <ul aria-label={title} className="divide-y">{visible.map(document => {
          const Icon = typeIcon[document.document_type];
          const session = sessionFor(document);
          const job = session?.job_title ? [session.job_title, session.job_company].filter(Boolean).join(' · ') : w('noJob');
          return <li key={document.id} className={cn('grid min-w-0 gap-3 p-4 lg:items-center lg:gap-4 lg:px-5', ROW_GRID)}>
            <div className="flex min-w-0 items-start gap-3"><Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0"><h2 className="break-words font-medium [overflow-wrap:anywhere]">{document.title}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{documentTypeLabel(document.document_type, t)}{document.output_language && ` · ${document.output_language === 'th' ? 'ไทย' : 'English'}`}</p></div>
            </div>
            <p className="min-w-0 break-words text-sm [overflow-wrap:anywhere]"><span className="text-muted-foreground lg:hidden">{w('colJob')}: </span>{job}</p>
            <p className="text-sm"><span className="text-muted-foreground lg:hidden">{w('colVersion')}: </span>{document.latest_revision ? w('version', { n: document.latest_revision.revision }) : '—'}</p>
            <div><Badge variant={document.partial ? 'warning' : 'success'}>{document.partial ? w('statusPartial') : w('statusReady')}</Badge></div>
            <div className="flex items-center gap-2 lg:justify-end">
              <Button asChild size="sm" variant="outline" className="min-h-11"><Link aria-label={`${w('open')}: ${document.title}`} to={`${base}/documents/${document.id}`}>{w('open')}</Link></Button>
              <DocumentDeleteMenu projectId={projectId} documentId={document.id} title={document.title}
                onTrashed={() => { setUndo({ id: document.id, message: c.trashed }); reloadAll(); }} onFailed={() => setUndo({ id: '', message: c.trashFailed })} />
            </div>
          </li>;
        })}</ul>
      </div>}
  </section>;
}

export function DocumentDetailPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const { projectId = '', documentId = '' } = useParams();
  const navigate = useNavigate();
  const base = `/app/projects/${projectId}`;
  const docs = useResource<DocumentItem[]>(`/projects/${projectId}/documents`);
  const trash = useResource<DocumentItem[]>(`/projects/${projectId}/documents/trash`);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPromote, setConfirmPromote] = useState(false);
  const [actionError, setActionError] = useState('');
  const [pickedId, setPickedId] = useState('');
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(params.get('edit') === '1');
  const contentRef = useRef<HTMLDivElement>(null);
  const stopEditing = () => { setEditing(false); if (params.has('edit')) setParams({}, { replace: true }); };
  const revisions = useResource<DocumentRevision[]>(`/projects/${projectId}/documents/${documentId}/revisions`);
  const cvRevisions = useResource<CVRevision[]>(`/projects/${projectId}/cv`);
  const [revNote, setRevNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [revBusy, setRevBusy] = useState(false);
  const sessions = useResource<SessionItem[]>(`/projects/${projectId}/sessions`);
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
  const jobs = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const w = (key: string, options?: Record<string, unknown>) => t(`documents.${key}`, { ns: 'materialsWorkspace', ...options });
  if (docs.status === 'loading') return <LoadingState />;
  if (docs.status === 'error') {
    if (docs.errorStatus === 404) return <MissingResource />;
    return <ErrorState onRetry={docs.reload} />;
  }
  const document = docs.data?.find(item => item.id === documentId) ?? trash.data?.find(item => item.id === documentId);
  if (!document && trash.status === 'loading') return <LoadingState />;
  if (!document) return <MissingResource />;
  const isTrashed = Boolean(document.trashed_at);
  async function restore() {
    setActionError('');
    try { await restoreDocument(projectId, documentId); docs.reload(); trash.reload(); } catch { setActionError(c.undoFailed); }
  }
  if (revisions.status === 'loading') return <LoadingState />;
  if (revisions.status === 'error') {
    if (revisions.errorStatus === 404) return <MissingResource />;
    return <ErrorState onRetry={revisions.reload} />;
  }
  const versions = revisions.data ?? [];
  const latestRevision = versions.find(revision => revision.id === document.latest_revision?.id) ?? versions.reduce<DocumentRevision | undefined>((latest, revision) => !latest || (revision.revision ?? 0) > (latest.revision ?? 0) ? revision : latest, undefined);
  const viewed = versions.find(revision => revision.id && revision.id === pickedId) ?? latestRevision;
  const historical = viewed !== undefined && viewed !== latestRevision;
  const preview = (viewed === latestRevision ? document.content_markdown ?? latestRevision?.content_markdown : viewed?.content_markdown) ?? null;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const Icon = typeIcon[document.document_type];
  const numbered = versions.map((revision, index) => ({ revision, number: revision.revision ?? index + 1, index }));
  const newestFirst = [...numbered].sort((a, b) => b.number - a.number);
  // Job provenance belongs to the revision being read, which may be older than the latest one.
  const sourceJobId = viewed?.source_job_revision_id;
  const sourceSessionId = runs.data?.find(run => run.id === document.source_run_id)?.session_id;
  const sourceJob = sourceJobId ? jobs.data?.find(job => job.id === sourceJobId) : undefined;
  const sourceSession = sourceSessionId ? sessions.data?.find(item => item.id === sourceSessionId) : undefined;
  const jobLabel = (job?: { title?: string | null; company?: string | null } | null) => [job?.title, job?.company].filter(Boolean).join(' · ');
  const sourceCvRevision = viewed?.source_cv_revision_id && cvRevisions.status === 'ready' ? cvRevisions.data?.find(item => item.id === viewed.source_cv_revision_id) : undefined;
  const viewedNumber = viewed ? viewed.revision ?? versions.indexOf(viewed) + 1 : 0;
  const requestHref = sessions.status === 'ready' && sessions.data?.[0] ? `${base}/sessions/${sessions.data[0].id}` : null;

  const canEdit = !isTrashed && preview !== null;
  const isCv = document.document_type === 'cv' && !isTrashed;
  const latestCv = [...(cvRevisions.data ?? [])].sort((a, b) => b.revision - a.revision)[0];
  async function restoreRevision(revisionId: string) {
    setRevBusy(true); setRevNote(null);
    try {
      let run = await sendJson<RunView>(`/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/restore`, 'POST', {});
      while (run.status === 'queued' || run.status === 'running' || run.status === 'waiting_approval') {
        await new Promise(resolve => window.setTimeout(resolve, 1500));
        run = await apiRequest<RunView>(`/projects/${projectId}/runs/${run.id}`);
      }
      if (run.status !== 'completed') throw new Error('restore_failed');
      setRevNote({ ok: true, text: c.restored }); setPickedId(''); docs.reload(); revisions.reload();
    } catch (caught) { setRevNote({ ok: false, text: caught instanceof ApiError && caught.code === 'document_busy' ? c.busyDoc : c.restoreFailed }); } finally { setRevBusy(false); }
  }
  async function promote(revisionId: string) {
    setRevBusy(true); setRevNote(null);
    try { await sendJson(`/projects/${projectId}/cv/promote`, 'POST', { revision_id: revisionId, expected_cv_revision_id: latestCv?.id }); setRevNote({ ok: true, text: c.promoteSent }); cvRevisions.reload(); }
    catch { setRevNote({ ok: false, text: c.promoteFailed }); } finally { setRevBusy(false); setConfirmPromote(false); }
  }

  return <article className="grid gap-6">
    <PageBack to={`${base}/documents`}>{t('nav.documents')}</PageBack>
    {isTrashed && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted px-4 py-3 text-sm">
      <span className="font-medium">{c.inTrash}</span>
      <span className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { void restore(); }}><RotateCcw className="size-4" aria-hidden="true" />{c.restore}</Button>
        <Button type="button" size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>{c.deleteForever}</Button></span>
      {actionError && <span role="alert" className="w-full text-destructive">{actionError}</span>}
    </div>}
    {confirmDelete && <ConfirmDeleteDialog confirmLabel={c.deleteForever} title={permanentTitle(locale === 'th', document.title)} description={permanentDescription(locale === 'th')}
      errors={{ document_in_use: inUseMessage(locale === 'th', projectId) }} onConfirm={() => deletePermanently(projectId, documentId)}
      onDone={() => navigate(`${base}/documents?view=trash`)} onClose={() => setConfirmDelete(false)} />}
    <div className="flex items-start gap-3"><Icon className="mt-1.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0"><h1 className="break-words text-2xl font-semibold">{document.title}</h1></div></div>
    {editing && canEdit ? <DocumentEditor c={c} projectId={projectId} documentId={documentId} initial={preview} onClose={stopEditing} onSaved={() => { setPickedId(''); stopEditing(); docs.reload(); revisions.reload(); }} /> :
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <Card className="min-w-0"><CardContent className="p-5 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{t('pages.documentContent', { defaultValue: 'Document content' })}</h2>
          {document.has_builder_draft && !isTrashed
            ? <Button asChild size="sm" className="min-h-11"><Link to={`/app/projects/${projectId}/documents/${document.id}/builder`}><Pencil className="size-4" aria-hidden="true" />{w('editInBuilder')}</Link></Button>
            : canEdit && <Button type="button" size="sm" className="min-h-11" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden="true" />{historical ? w('editFromThis') : w('editCurrent')}</Button>}
          {document.document_type === 'cv' && !document.has_builder_draft && <p className="w-full text-xs text-muted-foreground">{w('templateHint')}</p>}
          {versions.length > 1 && <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">{w('colVersion')}</span>
            <select className="min-h-9 rounded-md border border-input bg-card px-2 text-sm" value={viewed?.id ?? ''} onChange={event => setPickedId(event.target.value)}>
              {newestFirst.map(({ revision, number }) => <option key={revision.id ?? number} value={revision.id ?? ''}>{number}{revision === latestRevision ? ` · ${c.current}` : ''}{revision.origin === 'manual' ? ` · ${c.manual}` : ''}</option>)}</select></label>}</div>
        {historical && <div role="status" data-testid="historical-banner" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"><span className="flex items-start gap-2"><Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{w('historicalBanner', { n: viewedNumber })}</span>
          <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setPickedId('')}>{w('backToCurrent')}</Button></div>}
        {document.has_builder_draft && viewed?.file_id && <div className="mb-4 overflow-hidden rounded-lg border bg-white" style={{ aspectRatio: '1 / 1.414' }}>
          <PdfFrame url={downloadUrl(projectId, viewed.file_id)} title={w('templatePreview')} />
        </div>}
        <div ref={contentRef} className={document.has_builder_draft ? 'sr-only' : undefined}><Markdown className={cn('max-w-[68ch]', document.output_language === 'en' && 'document-english')} data-testid="document-content">{preview ?? t('pages.docPreviewUnavailable', { defaultValue: 'A text preview is unavailable. Download the authorized file to review this revision.' })}</Markdown></div>
        {preview && <CopyButton className="mt-4" source={contentRef} markdown={preview} />}
      </CardContent></Card>

      <div className="grid min-w-0 gap-6">
        <Card><CardHeader className="flex-row items-center justify-between gap-2"><CardTitle>{c.metadata}</CardTitle>
          {!isTrashed && <DocumentDeleteMenu projectId={projectId} documentId={document.id} title={document.title}
            onTrashed={() => navigate(`${base}/documents`, { state: { trashed: document.id } })} onFailed={() => setActionError(c.trashFailed)} />}</CardHeader><CardContent className="grid gap-3 text-sm">
          <p><span className="text-muted-foreground">{c.type}: </span>{documentTypeLabel(document.document_type, t)}</p>
          {document.output_language && <p data-testid="document-language">{t('pages.documentLanguage', { defaultValue: 'Document language' })}: {document.output_language === 'th' ? 'ไทย' : 'English'}</p>}
          {viewed && <p><span className="text-muted-foreground">{w('colVersion')}: </span>{viewedNumber}</p>}
          {viewed?.created_at && <p><span className="text-muted-foreground">{c.created}: </span><time dateTime={viewed.created_at}>{date.format(new Date(viewed.created_at))}</time></p>}
          {actionError && !isTrashed && <p role="alert" className="text-destructive">{actionError}</p>}
          {document.partial && <div><Badge variant="warning" role="status">{t('pages.partial', { defaultValue: 'Partial document' })}</Badge></div>}
          <div className="flex flex-wrap gap-2 pt-1">
            {viewed?.file_id && <Button asChild size="sm" className="min-h-11"><a href={downloadUrl(projectId, viewed.file_id)}><Download aria-hidden="true" />{w('downloadSelected')}</a></Button>}
            {requestHref && <Button asChild size="sm" variant="outline" className="min-h-11"><Link to={requestHref}>{c.requestChanges}</Link></Button>}
          </div>
        </CardContent></Card>

        {(sourceJobId || sourceSessionId || viewed?.source_cv_revision_id) && <Card><CardHeader><CardTitle>{w('sourcePanel')}</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm">
          {sourceJobId && <p className="break-words [overflow-wrap:anywhere]">{sourceJob && <span className="text-muted-foreground">{w('sourceJob')}: </span>}<Link className="text-primary hover:underline" to={`${base}/jobs/${sourceJobId}`}>{jobLabel(sourceJob) || w('sourceJob')}</Link>{sourceJob && <span className="text-muted-foreground"> · {w('sourceJobVersion', { n: sourceJob.revision })}</span>}</p>}
          {viewed?.source_cv_revision_id && <p><span className="text-muted-foreground">{w('sourceCv')}: </span>{sourceCvRevision ? w('sourceCvVersion', { n: sourceCvRevision.revision }) : t('pages.sourceCVUnavailable', { defaultValue: 'Source CV unavailable' })}</p>}
          {sourceSessionId && sessions.status === 'ready' && <p className="break-words [overflow-wrap:anywhere]">{sourceSession
            ? <><span className="text-muted-foreground">{w('sourceEvaluation')}: </span><Link className="text-primary hover:underline" to={`${base}/sessions/${sourceSessionId}`}>{jobLabel({ title: sourceSession.job_title, company: sourceSession.job_company }) || sourceSession.title}</Link></>
            : <span className="text-muted-foreground">{w('sourceEvaluation')}: {c.sessionDeleted}</span>}</p>}
        </CardContent></Card>}

        <Card><CardHeader><CardTitle>{t('documents.historyLabel', { ns: 'materialsWorkspace' })}</CardTitle></CardHeader><CardContent>
          {revNote && <p role={revNote.ok ? 'status' : 'alert'} className={cn('mb-3 text-sm', !revNote.ok && 'text-destructive')}>{revNote.text}</p>}
          <ol className="grid gap-3">{newestFirst.map(({ revision, number, index }) => {
            const sourceRevisionId = revision.source_cv_revision_id;
            const sourceRevision = sourceRevisionId && cvRevisions.status === 'ready'
              ? cvRevisions.data?.find(item => item.id === sourceRevisionId)
              : undefined;
            const isCurrent = latestRevision !== undefined && revision === latestRevision;
            return <li key={revision.id ?? `${revision.document_id}-${index}`} className={cn('grid gap-1.5 rounded-lg border p-3 text-sm', isCurrent && 'border-primary bg-primary/5')}>
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{w('version', { n: number })}</span>{isCurrent && <Badge>{c.current}</Badge>}{revision.origin && <Badge variant={revision.origin === 'manual' ? 'secondary' : 'outline'}>{revision.origin === 'manual' ? c.manual : c.ai}</Badge>}
                {revision.created_at && <time className="text-muted-foreground" dateTime={revision.created_at}>{date.format(new Date(revision.created_at))}</time>}</div>
              <p className="break-words text-muted-foreground">
                {sourceRevision ? <span data-testid={`source-cv-revision-${number}`}>{t('pages.sourceCVRevision', { revision: sourceRevision.revision, defaultValue: `CV revision ${sourceRevision.revision}` })}</span> : cvRevisions.status === 'loading' && sourceRevisionId ? <span data-testid={`source-cv-lookup-${number}`}>…</span> : <span data-testid="source-cv-unavailable">{t('pages.sourceCVUnavailable', { defaultValue: 'Source CV unavailable' })}{sourceRevisionId && <> · <code className="break-all">{sourceRevisionId}</code></>}</span>}
                {' '}<Link className="text-primary hover:underline" to={`${base}/profile`}>{t('pages.openCVProfile', { defaultValue: 'Open CV profile' })}</Link>
              </p>
              {isCv && revision.id && <div className="flex flex-wrap gap-2">
                {!isCurrent && <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={revBusy} onClick={() => void restoreRevision(revision.id!)}><RotateCcw className="size-4" aria-hidden="true" />{revBusy ? c.restoring : c.restoreVersion}</Button>}
                {isCurrent && revision.file_id && latestCv && (confirmPromote
                  ? <span role="group" aria-label={c.promoteAsk} className="flex flex-wrap items-center gap-2 text-sm"><span>{c.promoteAsk}</span>
                    <Button type="button" size="sm" className="min-h-11" disabled={revBusy} onClick={() => void promote(revision.id!)}>{c.promoteConfirm}</Button>
                    <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={revBusy} onClick={() => setConfirmPromote(false)}>{c.promoteCancel}</Button></span>
                  : <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={revBusy} onClick={() => setConfirmPromote(true)}>{c.promote}</Button>)}
              </div>}
              {revision.file_id && <a className="inline-flex w-fit items-center gap-1.5 text-primary hover:underline" href={downloadUrl(projectId, revision.file_id)}><Download className="size-4" aria-hidden="true" />{t('pages.downloadDocument', { defaultValue: 'Download document' })}</a>}
            </li>;
          })}</ol>
        </CardContent></Card>
      </div>
    </div>}
  </article>;
}

// A template document's real PDF, retyped so the browser shows it inline instead of downloading it.
function PdfFrame({ url, title }: { url: string; title: string }) {
  const preview = useFilePreview(url, 'application/pdf');
  return preview.status === 'pdf'
    ? <iframe title={title} src={`${preview.url}#view=FitH&toolbar=0&navpanes=0`} className="size-full border-0" />
    : <div className="grid size-full place-items-center text-sm text-gray-600">{preview.status === 'loading' ? '…' : '—'}</div>;
}
