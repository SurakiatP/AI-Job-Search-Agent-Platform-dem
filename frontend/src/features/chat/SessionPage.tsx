import { useEffect, useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Bot, ChevronDown, Pencil, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/PageBack';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Markdown } from '@/components/Markdown';
import { CopyButton } from '@/components/CopyButton';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useDraft } from '../../app/drafts';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import { NewSessionButton } from '../sessions/NewSessionDialog';
import { apiRequest } from '../../lib/api';
import { ApiError, type DocumentView, type Locale, type RunOperation, type RunView, type SessionView } from '../../lib/api-types';
import { useRun } from './useRun';
import { RunTimeline } from './RunTimeline';
import { ApprovalCard } from './ApprovalCard';
import { RunResults } from './RunResults';

const selectClass = 'flex min-h-9 rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const copy = {
  th: { title: 'เซสชัน', unpaired: 'ยังไม่ได้จับคู่', unpairedBody: 'เซสชันเก่านี้ไม่ได้จับคู่ CV กับงาน จึงดูได้อย่างเดียว เริ่มเซสชันใหม่เพื่อประเมินและร่างเอกสาร', startPaired: 'เริ่มเซสชันที่จับคู่', outdated: 'มี CV เวอร์ชันใหม่', outdatedBody: 'เซสชันนี้ใช้ CV เวอร์ชันเก่า เริ่มเซสชันใหม่ด้วย CV ล่าสุดกับงานเดิม', outdatedBtn: 'เริ่มด้วย CV ล่าสุด', eval: 'การประเมิน', evalNone: 'ยังไม่มีผลประเมิน', draft: 'ร่างเอกสาร', draftBody: 'เลือกประเภทเอกสารที่ต้องการ เอเจนต์จะร่างจาก CV และงานคู่นี้', letter: 'จดหมายสมัครงาน', message: 'ข้อความสมัครงาน', lang: 'ภาษาเอกสาร', docs: 'เอกสารที่ร่างในเซสชันนี้', noDocs: 'ยังไม่มีเอกสาร', open: 'เปิดเอกสาร', revise: 'สั่งแก้', reviseHint: 'บอกสิ่งที่ต้องการแก้ ระบบจะสร้างเวอร์ชันใหม่ของเอกสารนี้', send: 'ส่งคำสั่งแก้', cancel: 'หยุดงาน', retry: 'ลองใหม่เป็นงานใหม่', refresh: 'โหลดสถานะใหม่', noProvider: 'ยังไม่ได้ตั้งค่าผู้ให้บริการ AI', settings: 'ไปที่การตั้งค่า', version: 'เวอร์ชัน', you: 'คุณ', cvPage: 'เปิดหน้า CV', jobPage: 'ดูรายละเอียดงาน', letterAsk: 'ร่างจดหมายสมัครงาน (cover letter) สำหรับงานนี้', messageAsk: 'ร่างข้อความสมัครงานสั้น ๆ สำหรับส่งผู้รับสมัครงานนี้', th: 'ไทย', en: 'English', readOnly: 'ข้อความในเซสชันเก่า (ดูอย่างเดียว)', redraft: 'ร่างใหม่ทั้งฉบับ', redraftConfirm: 'จะสร้างเวอร์ชันใหม่ของเอกสารเดิม', redraftBody: 'เอเจนต์จะร่างใหม่ทั้งฉบับและเพิ่มเป็นเวอร์ชันใหม่ของเอกสารนี้ เวอร์ชันเดิมยังอยู่ในประวัติ', confirm: 'ร่างใหม่', dismiss: 'ยกเลิก', edit: 'แก้ไข', reviseAi: 'สั่งแก้ด้วย AI', draftStatus: 'สถานะการร่างเอกสาร' },
  en: { title: 'Session', unpaired: 'Not paired', unpairedBody: 'This older session has no CV and job pair, so it is read-only. Start a new session to evaluate and draft.', startPaired: 'Start a paired session', outdated: 'A newer CV version exists', outdatedBody: 'This session uses an older CV version. Start a new session with the latest CV and the same job.', outdatedBtn: 'Start with latest CV', eval: 'Evaluation', evalNone: 'No evaluation yet', draft: 'Draft documents', draftBody: 'Pick a document type. The agent drafts it from this CV and job pair.', letter: 'Cover letter', message: 'Application message', lang: 'Document language', docs: 'Documents drafted in this session', noDocs: 'No documents yet', open: 'Open document', revise: 'Revise', reviseHint: 'Say what to change. A new version of this document is created.', send: 'Send revision request', cancel: 'Stop run', retry: 'Retry as a new run', refresh: 'Refresh status', noProvider: 'The AI provider is not configured yet.', settings: 'Open settings', version: 'Version', you: 'You', cvPage: 'Open CV page', jobPage: 'View job details', letterAsk: 'Draft a cover letter for this job.', messageAsk: 'Draft a short application message to send to the recruiter for this job.', th: 'ไทย', en: 'English', readOnly: 'Messages from the older session (read-only)', redraft: 'Redraft from scratch', redraftConfirm: 'This creates a new version of the existing document', redraftBody: 'The agent drafts the whole document again and adds it as a new version of this document. Earlier versions stay in the history.', confirm: 'Redraft', dismiss: 'Cancel', edit: 'Edit', reviseAi: 'Revise with AI', draftStatus: 'Draft status' },
};
type DraftKind = 'cover_letter' | 'application_message';
const ACTIVE = ['queued', 'running', 'waiting_approval'];

function ReviseBox({ c, projectId, docId, busy, onSubmit }: { c: typeof copy.en; projectId: string; docId: string; busy: boolean; onSubmit: (text: string) => Promise<boolean> }) {
  const [text, setText] = useDraft(projectId, docId, 'revise');
  const [open, setOpen] = useState(text !== '');
  const id = useId();
  return <div className="grid gap-2">
    <Button type="button" variant="ghost" size="sm" className="min-h-11 justify-self-start" aria-expanded={open} onClick={() => setOpen(value => !value)}><ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />{c.reviseAi}</Button>
    {open && <form className="grid gap-2" onSubmit={event => { event.preventDefault(); if (text.trim() && !busy) void onSubmit(text.trim()).then(ok => { if (ok) setText(''); }); }}>
      <label className="text-sm font-medium" htmlFor={id}>{c.revise}</label>
      <Textarea id={id} rows={2} maxLength={500} value={text} placeholder={c.reviseHint} onChange={event => setText(event.target.value)} disabled={busy} />
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{text.length}/500</span><Button type="submit" size="sm" className="min-h-11" disabled={busy || !text.trim()}>{c.send}</Button></div>
    </form>}
  </div>;
}

function DocCard({ c, base, projectId, doc, busy, onRevise }: { c: typeof copy.en; base: string; projectId: string; doc: DocumentView; busy: boolean; onRevise: (text: string) => Promise<boolean> }) {
  const ref = useRef<HTMLDivElement>(null);
  // The document list omits content; the latest revision carries it.
  const revisions = useResource<{ revision: number; content_markdown?: string | null }[]>(`/projects/${projectId}/documents/${doc.id}/revisions`);
  const content = doc.content_markdown ?? [...(revisions.data ?? [])].sort((a, b) => b.revision - a.revision)[0]?.content_markdown ?? null;
  return <Card><CardContent className="grid gap-3 p-4">
    <h3 className="min-w-0 break-words font-semibold">{doc.title}{doc.latest_revision ? <span className="ms-2 text-sm font-normal text-muted-foreground">{c.version} {doc.latest_revision.revision}</span> : null}</h3>
    {content && <Link to={`${base}/documents/${doc.id}`} className="relative block max-h-28 overflow-hidden rounded-md text-foreground no-underline" title={c.open}>
      <div ref={ref}><Markdown>{content}</Markdown></div><div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" aria-hidden="true" /></Link>}
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" className="min-h-11"><Link to={`${base}/documents/${doc.id}?edit=1`}><Pencil className="size-4" aria-hidden="true" />{c.edit}</Link></Button>
      {content && <CopyButton source={ref} markdown={content} />}
    </div>
    <ReviseBox c={c} projectId={projectId} docId={doc.id} busy={busy} onSubmit={onRevise} />
  </CardContent></Card>;
}

export function SessionPage() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const { projectId = '', sessionId = '' } = useParams();
  const base = `/app/projects/${projectId}`;
  const session = useResource<SessionView>(`/projects/${projectId}/sessions/${sessionId}`);
  const project = useResource<{ name: string }>(`/projects/${projectId}`);
  const documents = useResource<DocumentView[]>(`/projects/${projectId}/documents`);
  const trashed = useResource<DocumentView[]>(`/projects/${projectId}/documents/trash`);
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
  const workflow = useRun(projectId, sessionId);
  const [outputLanguage, setOutputLanguage] = useState<Locale>(locale);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const last = useRef<{ operation: RunOperation; instructions: string; documentId?: string; draftKind?: DraftKind } | null>(null);
  const [confirmKind, setConfirmKind] = useState<DraftKind | null>(null);
  const status = workflow.run?.status;
  const runId = workflow.run?.id;
  const { reload: reloadRuns } = runs; const { reload: reloadDocs } = documents; const { reload: reloadTrash } = trashed;
  useEffect(() => { reloadRuns(); if (status && !ACTIVE.includes(status)) { reloadDocs(); reloadTrash(); } }, [runId, status, reloadRuns, reloadDocs, reloadTrash]);
  const resources = [session, documents, runs];
  if (resources.some(item => item.status === 'loading' && item.data === undefined) || workflow.loading) return <LoadingState />;
  if (session.errorStatus === 404) return <MissingResource />;
  if (resources.some(item => item.status === 'error')) return <ErrorState onRetry={() => resources.forEach(item => item.reload())} />;
  const current = session.data;
  if (!current) return <MissingResource />;
  const paired = Boolean(current.cv_revision_id && current.job_revision_id);
  const active = Boolean(status && ACTIVE.includes(status));
  const sessionRuns = (runs.data ?? []).filter(run => run.session_id === sessionId);
  const evalRun = sessionRuns.find(run => run.operation === 'evaluate_job') ?? null;
  const draftRunIds = new Set(sessionRuns.filter(run => run.operation === 'draft_documents').map(run => run.id));
  const drafted = (documents.data ?? []).filter(doc => doc.source_run_id && draftRunIds.has(doc.source_run_id));
  const busy = active || submitting || workflow.submitting;

  async function startRun(operation: RunOperation, instructions: string, documentId?: string, retryOf?: string, draftKind?: DraftKind): Promise<boolean> {
    setSubmitting(true); setError('');
    const key = crypto.randomUUID();
    try {
      await apiRequest<RunView>(`/projects/${projectId}/runs`, {
        method: 'POST', headers: { 'Idempotency-Key': key },
        body: JSON.stringify({ session_id: sessionId, operation, output_language: outputLanguage, idempotency_key: key, ...(instructions ? { owner_instructions: instructions } : {}), ...(documentId ? { document_id: documentId } : {}), ...(draftKind ? { draft_kind: draftKind } : {}), ...(retryOf ? { retry_of_id: retryOf } : {}) }),
      });
      last.current = { operation, instructions, documentId, draftKind };
      await workflow.reload().catch(() => undefined); reloadRuns();
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError && caught.code === 'provider_configuration_required' ? 'provider' : caught instanceof ApiError ? caught.message_key : 'errors.request_failed');
      return false;
    } finally { setSubmitting(false); }
  }
  const retry = () => {
    const previous = last.current ?? (workflow.run?.operation === 'evaluate_job' ? { operation: 'evaluate_job' as const, instructions: '' } : null);
    if (previous && workflow.run) void startRun(previous.operation, previous.instructions, previous.documentId, workflow.run.id, previous.draftKind);
  };
  const failed = status && !ACTIVE.includes(status) && status !== 'completed' && workflow.run?.operation !== 'export_document';
  const evalIsLatest = workflow.run?.operation === 'evaluate_job';
  const liveDoc = (kind: DraftKind) => drafted.find(doc => doc.document_type === kind);
  const draftNow = (kind: DraftKind) => { setConfirmKind(null); void startRun('draft_documents', kind === 'cover_letter' ? c.letterAsk : c.messageAsk, undefined, undefined, kind); };
  const askDraft = (kind: DraftKind) => liveDoc(kind) ? setConfirmKind(kind) : draftNow(kind);
  const kindLabel = (kind: DraftKind) => kind === 'cover_letter' ? c.letter : c.message;
  const draftLabel = (kind: DraftKind) => liveDoc(kind) ? `${c.redraft}: ${kindLabel(kind)}` : kindLabel(kind);
  const runPanel = <>
    {workflow.error && <p className="flex flex-wrap items-center gap-3 text-sm text-destructive" role="alert"><span className="min-w-0 break-words">{t(workflow.error, { defaultValue: t('pages.loadError') })}</span> <Button type="button" variant="outline" size="sm" onClick={() => void workflow.reload().catch(() => undefined)}>{c.refresh}</Button></p>}
    <RunTimeline locale={locale} run={workflow.run} events={workflow.events} cancellationPending={workflow.cancellationPending} />
    {active && <Button type="button" variant="outline" className="self-start" disabled={workflow.submitting || workflow.cancellationPending} onClick={() => void workflow.cancel()}>{c.cancel}</Button>}
    {failed && (last.current || workflow.run?.operation === 'evaluate_job') && <Button type="button" variant="outline" className="self-start" disabled={busy} onClick={retry}>{c.retry}</Button>}
    <ApprovalCard approval={workflow.pendingApproval} locale={locale} busy={workflow.submitting} onDecision={(id, decision) => void workflow.decideApproval(id, decision)} onRefresh={() => void workflow.reload().catch(() => undefined)} />
  </>;
  return <section className="flex min-w-0 flex-col gap-4">
    <Breadcrumb label={c.title} items={[{ label: project.data?.name ?? t('pages.project'), to: `${base}/overview` }, { label: current.title }]} />
    <div className="grid gap-2"><h1 className="break-words text-2xl font-semibold">{current.title}</h1>
      {paired ? <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Link className="font-medium text-primary hover:underline" to={`${base}/profile`} title={c.cvPage}>{current.cv_name} · v{current.cv_revision}</Link>
        <ArrowLeftRight className="size-4 text-muted-foreground" aria-hidden="true" />
        <Link className="font-medium text-primary hover:underline" to={`${base}/jobs/${current.job_revision_id}`} title={c.jobPage}>{current.job_title}{current.job_company ? ` · ${current.job_company}` : ''}</Link></p>
        : <Badge variant="outline" className="w-fit">{c.unpaired}</Badge>}</div>

    {!paired && <Card><CardContent className="grid gap-3 p-4"><p className="text-sm">{c.unpairedBody}</p><NewSessionButton projectId={projectId} className="justify-self-start">{c.startPaired}</NewSessionButton></CardContent></Card>}
    {paired && current.cv_outdated && <Card role="status" className="border-warning/50"><CardContent className="flex flex-wrap items-center gap-3 p-4">
      <TriangleAlert className="size-5 text-warning" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="font-medium">{c.outdated}</p><p className="text-sm text-muted-foreground">{c.outdatedBody}</p></div>
      <NewSessionButton size="sm" projectId={projectId} job={{ savedId: current.job_revision_id ?? undefined }} cvName={current.cv_name ?? undefined}>{c.outdatedBtn}</NewSessionButton></CardContent></Card>}
    {error === 'provider' && <Card role="alert" className="border-warning/50"><CardContent className="flex flex-wrap items-center gap-3 p-4"><p className="min-w-0 flex-1 font-medium">{c.noProvider}</p><Button asChild size="sm"><Link to="/app/settings">{c.settings}</Link></Button></CardContent></Card>}
    {error && error !== 'provider' && <p className="text-sm text-destructive" role="alert">{t(error, { defaultValue: t('pages.loadError') })}</p>}

    {!paired && workflow.messages.length > 0 && <div className="grid gap-3"><h2 className="text-sm font-medium text-muted-foreground">{c.readOnly}</h2>{workflow.messages.map(item => item.role === 'user'
      ? <article key={item.id} className="flex flex-col items-end gap-1"><p className="text-xs text-muted-foreground">{c.you}</p><p className="plain-content chat-text m-0 max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground">{item.content}</p></article>
      : <article key={item.id} className="flex items-start gap-3"><span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true"><Bot className="size-4" /></span><p className="plain-content chat-text m-0 min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm border bg-card px-4 py-2">{item.content}</p></article>)}</div>}

    {paired && <>
      <h2 className="text-lg font-semibold">{c.eval}</h2>
      {evalIsLatest ? runPanel : <RunTimeline locale={locale} run={evalRun} events={[]} />}
      {evalRun ? <RunResults projectId={projectId} locale={locale} run={evalRun} documents={[]} trashedDocuments={[]} /> : !active && <p className="text-sm text-muted-foreground">{c.evalNone}</p>}

      <Card><CardHeader><CardTitle className="text-lg">{c.draft}</CardTitle></CardHeader><CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">{c.draftBody}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" className="min-h-11" variant={liveDoc('cover_letter') ? 'outline' : 'default'} disabled={busy} onClick={() => askDraft('cover_letter')}>{draftLabel('cover_letter')}</Button>
          <Button type="button" className="min-h-11" variant="outline" disabled={busy} onClick={() => askDraft('application_message')}>{draftLabel('application_message')}</Button>
          <label className="ms-auto flex items-center gap-2 text-sm">{c.lang}<select className={selectClass} value={outputLanguage} onChange={event => setOutputLanguage(event.target.value === 'en' ? 'en' : 'th')} disabled={busy}><option value="th">{c.th}</option><option value="en">{c.en}</option></select></label>
        </div>{!evalIsLatest && runPanel}</CardContent></Card>
    {confirmKind && <Dialog open onOpenChange={open => { if (!open) setConfirmKind(null); }}><DialogContent>
      <DialogTitle>{c.redraftConfirm}</DialogTitle><DialogDescription>{kindLabel(confirmKind)}: {c.redraftBody}</DialogDescription>
      <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="outline" className="min-h-11">{c.dismiss}</Button></DialogClose><Button type="button" className="min-h-11" onClick={() => draftNow(confirmKind)}>{c.confirm}</Button></div>
    </DialogContent></Dialog>}

      <h2 className="text-lg font-semibold">{c.docs}</h2>
      {drafted.length === 0 ? <p className="text-sm text-muted-foreground">{c.noDocs}</p> : drafted.map(doc => <DocCard key={doc.id} c={c} base={base} projectId={projectId} doc={doc} busy={busy} onRevise={text => startRun('draft_documents', text, doc.id)} />)}
    </>}
  </section>;
}
