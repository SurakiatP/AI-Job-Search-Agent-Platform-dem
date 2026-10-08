import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Download, File, FileUser, Mail, RotateCcw, Trash2, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageBack } from '@/components/PageBack';
import { Markdown } from '@/components/Markdown';
import { cn } from '@/lib/utils';
import type { RunView } from '@/lib/api-types';
import { ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { DocumentDeleteMenu } from './DocumentDeleteMenu';
import { TrashView, deletePermanently, inUseMessage, permanentDescription, permanentTitle, restoreDocument } from './TrashView';

type DocumentItem = { id: string; document_type: 'cv' | 'cover_letter' | 'other'; title: string; content_markdown?: string | null; output_language?: 'th' | 'en' | null; source_run_id?: string | null; partial?: boolean; trashed_at?: string | null; latest_revision?: { id: string; revision: number } | null };
type DocumentRevision = { document_id: string; id?: string; revision?: number; created_at?: string; source_cv_revision_id?: string | null; source_job_revision_id?: string | null; file_id?: string | null; content_markdown?: string | null };
type CVRevision = { id: string; revision: number };
type SessionItem = { id: string };
type DocType = DocumentItem['document_type'];

const copy = {
  th: { all: 'ทั้งหมด', filter: 'กรองตามประเภท', empty: 'ไม่มีเอกสารในประเภทนี้', evaluate: 'ไปที่หน้าประเมิน', back: 'กลับไปหน้าเอกสาร', type: 'ประเภท', created: 'สร้างเมื่อ', revisions: 'ประวัติฉบับ', current: 'ฉบับปัจจุบัน', metadata: 'รายละเอียด', downloadLatest: 'ดาวน์โหลดฉบับล่าสุด', requestChanges: 'ขอแก้ไข', sourceJob: 'งานต้นทาง', sourceSession: 'เซสชันต้นทาง', trash: 'ถังขยะ', trashed: 'ย้ายไปถังขยะแล้ว', undo: 'เลิกทำ', trashFailed: 'ย้ายไปถังขยะไม่สำเร็จ ลองอีกครั้ง', undoFailed: 'กู้คืนไม่สำเร็จ ลองอีกครั้ง', inTrash: 'เอกสารนี้อยู่ในถังขยะ', restore: 'กู้คืน', deleteForever: 'ลบถาวร' },
  en: { all: 'All', filter: 'Filter by type', empty: 'No documents of this type', evaluate: 'Go to Evaluate', back: 'Back to documents', type: 'Type', created: 'Created', revisions: 'Revisions', current: 'Current', metadata: 'Details', downloadLatest: 'Download latest', requestChanges: 'Request changes', sourceJob: 'Source job', sourceSession: 'Source session', trash: 'Trash', trashed: 'Moved to trash', undo: 'Undo', trashFailed: 'Could not move to trash. Try again.', undoFailed: 'Could not restore. Try again.', inTrash: 'This document is in the trash', restore: 'Restore', deleteForever: 'Delete permanently' },
};

const typeIcon: Record<DocType, LucideIcon> = { cv: FileUser, cover_letter: Mail, other: File };
const downloadUrl = (projectId: string, fileId: string) => `/api/v1/projects/${projectId}/files/${fileId}/download`;

function documentTypeLabel(type: DocType, t: (key: string, options: { defaultValue: string }) => string) {
  const labels = { cv: ['pages.docTypeCv', 'CV'], cover_letter: ['pages.docTypeCoverLetter', 'Cover letter'], other: ['pages.docTypeOther', 'Other document'] } as const;
  const [key, fallback] = labels[type];
  return t(key, { defaultValue: fallback });
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
  const evaluateHref = sessions.data?.[0] ? `${base}/sessions/${sessions.data[0].id}` : `${base}/profile`;
  const title = t('pages.documentsTitle', { defaultValue: 'Documents' });
  if (!documents.length && !trashed.length) return <section className="mx-auto grid max-w-xl gap-3 py-12">
    <h1 className="text-2xl font-semibold">{t('pages.noDocumentsTitle', { defaultValue: 'No documents yet' })}</h1>
    <p className="text-muted-foreground">{t('pages.noDocumentsDescription', { defaultValue: 'Documents created for this project will appear here.' })}</p>
    <div><Button asChild><Link to={evaluateHref}>{c.evaluate}</Link></Button></div>
  </section>;
  const chips: [DocType | 'all', string][] = [['all', c.all], ['cv', documentTypeLabel('cv', t)], ['cover_letter', documentTypeLabel('cover_letter', t)], ['other', documentTypeLabel('other', t)]];
  const visible = filter === 'all' ? documents : documents.filter(document => document.document_type === filter);
  const chipClass = (active: boolean) => cn('rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', active && 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90');
  const showView = (trashView: boolean) => setParams(trashView ? { view: 'trash' } : {}, { replace: true });
  async function undoTrash() {
    if (!undo) return;
    try { await restoreDocument(projectId, undo.id); setUndo(null); reloadAll(); } catch { setUndo({ id: undo.id, message: c.undoFailed }); }
  }
  return <section className="grid gap-6">
    <PageBack to={`/app/projects/${projectId}/overview`}>{t('nav.overview')}</PageBack>
    <h1 className="text-2xl font-semibold">{title}</h1>
    {undo && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted px-4 py-2 text-sm">
      <span>{undo.message}</span>
      {undo.id && <Button type="button" size="sm" variant="outline" onClick={() => { void undoTrash(); }}><RotateCcw className="size-4" aria-hidden="true" />{c.undo}</Button>}
    </div>}
    <div className="flex flex-wrap gap-2" role="group" aria-label={c.filter}>{chips.map(([value, label]) => <button key={value} type="button" aria-pressed={!inTrashView && filter === value}
      className={chipClass(!inTrashView && filter === value)} onClick={() => { setFilter(value); showView(false); }}>{label}</button>)}
      <button type="button" aria-pressed={inTrashView} className={cn(chipClass(inTrashView), 'inline-flex items-center gap-1.5')} onClick={() => showView(true)}><Trash2 className="size-4" aria-hidden="true" />{c.trash} ({trashed.length})</button></div>
    {inTrashView ? <TrashView projectId={projectId} items={trashed} typeLabel={type => documentTypeLabel(type, t)} onChanged={reloadAll} /> :
    visible.length === 0 ? <p className="text-sm text-muted-foreground">{c.empty}</p> :
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(document => {
        const Icon = typeIcon[document.document_type];
        return <Card key={document.id} className="transition-shadow hover:shadow-md"><CardHeader>
          <div className="flex items-start gap-3"><Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <CardTitle className="min-w-0 flex-1 break-words text-base"><Link className="hover:underline" to={`${base}/documents/${document.id}`}>{document.title}</Link></CardTitle>
            <DocumentDeleteMenu projectId={projectId} documentId={document.id} title={document.title}
              onTrashed={() => { setUndo({ id: document.id, message: c.trashed }); reloadAll(); }} onFailed={() => setUndo({ id: '', message: c.trashFailed })} /></div>
        </CardHeader><CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">{documentTypeLabel(document.document_type, t)}</p>
          <div className="flex flex-wrap gap-2">
            {document.output_language && <Badge variant="outline">{document.output_language === 'th' ? 'ไทย' : 'English'}</Badge>}
            {document.latest_revision && <Badge variant="secondary">{t('pages.revision', { defaultValue: 'Revision' })} {document.latest_revision.revision}</Badge>}
          {document.partial && <Badge variant="warning">{t('pages.partial', { defaultValue: 'Partial document' })}</Badge>}
          </div>
        </CardContent></Card>;
      })}</div>}
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
  const [actionError, setActionError] = useState('');
  const [pickedId, setPickedId] = useState('');
  const revisions = useResource<DocumentRevision[]>(`/projects/${projectId}/documents/${documentId}/revisions`);
  const cvRevisions = useResource<CVRevision[]>(`/projects/${projectId}/cv`);
  const sessions = useResource<SessionItem[]>(`/projects/${projectId}/sessions`);
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
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
  const preview = (viewed === latestRevision ? document.content_markdown ?? latestRevision?.content_markdown : viewed?.content_markdown) ?? null;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const Icon = typeIcon[document.document_type];
  const numbered = versions.map((revision, index) => ({ revision, number: revision.revision ?? index + 1, index }));
  const newestFirst = [...numbered].sort((a, b) => b.number - a.number);
  const sourceJobId = latestRevision?.source_job_revision_id;
  const sourceSessionId = runs.data?.find(run => run.id === document.source_run_id)?.session_id;
  const requestHref = sessions.status === 'ready' && sessions.data?.[0] ? `${base}/sessions/${sessions.data[0].id}` : null;

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
      <div className="min-w-0"><p className="text-sm text-muted-foreground">{t('pages.documentsTitle', { defaultValue: 'Documents' })}</p><h1 className="break-words text-2xl font-semibold">{document.title}</h1></div></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <Card className="min-w-0"><CardContent className="p-5 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{t('pages.documentContent', { defaultValue: 'Document content' })}</h2>
          {versions.length > 1 && <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">{t('pages.revision', { defaultValue: 'Revision' })}</span>
            <select className="min-h-9 rounded-md border border-input bg-card px-2 text-sm" value={viewed?.id ?? ''} onChange={event => setPickedId(event.target.value)}>
              {newestFirst.map(({ revision, number }) => <option key={revision.id ?? number} value={revision.id ?? ''}>{number}{revision === latestRevision ? ` · ${c.current}` : ''}</option>)}</select></label>}</div>
        <Markdown className={cn('max-w-[68ch]', document.output_language === 'en' && 'document-english')} data-testid="document-content">{preview ?? t('pages.docPreviewUnavailable', { defaultValue: 'A text preview is unavailable. Download the authorized file to review this revision.' })}</Markdown>
      </CardContent></Card>

      <div className="grid min-w-0 gap-6">
        <Card><CardHeader className="flex-row items-center justify-between gap-2"><CardTitle>{c.metadata}</CardTitle>
          {!isTrashed && <DocumentDeleteMenu projectId={projectId} documentId={document.id} title={document.title}
            onTrashed={() => navigate(`${base}/documents`, { state: { trashed: document.id } })} onFailed={() => setActionError(c.trashFailed)} />}</CardHeader><CardContent className="grid gap-3 text-sm">
          <p><span className="text-muted-foreground">{c.type}: </span>{documentTypeLabel(document.document_type, t)}</p>
          {document.output_language && <p data-testid="document-language">{t('pages.documentLanguage', { defaultValue: 'Document language' })}: {document.output_language === 'th' ? 'ไทย' : 'English'}</p>}
          {viewed && <p><span className="text-muted-foreground">{t('pages.revision', { defaultValue: 'Revision' })}: </span>{viewed.revision ?? versions.indexOf(viewed) + 1}</p>}
          {viewed?.created_at && <p><span className="text-muted-foreground">{c.created}: </span><time dateTime={viewed.created_at}>{date.format(new Date(viewed.created_at))}</time></p>}
            {sourceJobId && <p><Link className="text-primary hover:underline" to={`${base}/jobs/${sourceJobId}`}>{c.sourceJob}</Link></p>}
          {sourceSessionId && <p><Link className="text-primary hover:underline" to={`${base}/sessions/${sourceSessionId}`}>{c.sourceSession}</Link></p>}
          {actionError && !isTrashed && <p role="alert" className="text-destructive">{actionError}</p>}
          {document.partial && <div><Badge variant="warning" role="status">{t('pages.partial', { defaultValue: 'Partial document' })}</Badge></div>}
          <div className="flex flex-wrap gap-2 pt-1">
            {latestRevision?.file_id && <Button asChild size="sm"><a href={downloadUrl(projectId, latestRevision.file_id)}><Download aria-hidden="true" />{c.downloadLatest}</a></Button>}
            {requestHref && <Button asChild size="sm" variant="outline"><Link to={requestHref}>{c.requestChanges}</Link></Button>}
          </div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>{c.revisions}</CardTitle></CardHeader><CardContent>
          <ol className="grid gap-3">{newestFirst.map(({ revision, number, index }) => {
            const sourceRevisionId = revision.source_cv_revision_id;
            const sourceRevision = sourceRevisionId && cvRevisions.status === 'ready'
              ? cvRevisions.data?.find(item => item.id === sourceRevisionId)
              : undefined;
            const isCurrent = latestRevision !== undefined && revision === latestRevision;
            return <li key={revision.id ?? `${revision.document_id}-${index}`} className={cn('grid gap-1.5 rounded-lg border p-3 text-sm', isCurrent && 'border-primary bg-primary/5')}>
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{t('pages.revision', { defaultValue: 'Revision' })} {number}</span>{isCurrent && <Badge>{c.current}</Badge>}
                {revision.created_at && <time className="text-muted-foreground" dateTime={revision.created_at}>{date.format(new Date(revision.created_at))}</time>}</div>
              <p className="break-words text-muted-foreground">
                {sourceRevision ? <span data-testid={`source-cv-revision-${number}`}>{t('pages.sourceCVRevision', { revision: sourceRevision.revision, defaultValue: `CV revision ${sourceRevision.revision}` })}</span> : cvRevisions.status === 'loading' && sourceRevisionId ? <span data-testid={`source-cv-lookup-${number}`}>…</span> : <span data-testid="source-cv-unavailable">{t('pages.sourceCVUnavailable', { defaultValue: 'Source CV unavailable' })}{sourceRevisionId && <> · <code className="break-all">{sourceRevisionId}</code></>}</span>}
                {' '}<Link className="text-primary hover:underline" to={`${base}/profile`}>{t('pages.openCVProfile', { defaultValue: 'Open CV profile' })}</Link>
              </p>
              {revision.file_id && <a className="inline-flex w-fit items-center gap-1.5 text-primary hover:underline" href={downloadUrl(projectId, revision.file_id)}><Download className="size-4" aria-hidden="true" />{t('pages.downloadDocument', { defaultValue: 'Download document' })}</a>}
            </li>;
          })}</ol>
        </CardContent></Card>
      </div>
    </div>
  </article>;
}
