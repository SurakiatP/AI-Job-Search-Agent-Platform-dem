import { useEffect, useId, useRef, useState } from 'react';
import { accountErrorText, useGatewayHelp, useRunGate } from '@/lib/accountGate';
import { CvPreviewButton } from '@/components/CvPreview';
import { Link, useParams, useSearchParams } from 'react-router';
import { PracticeTab } from '../practice/PracticeTab';
import { practiceCopy } from '../practice/copy';
import { useTranslation } from 'react-i18next';
import { Bot, Briefcase, Check, ChevronDown, FileText, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Markdown } from '@/components/Markdown';
import { CopyButton } from '@/components/CopyButton';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useDraft } from '../../app/drafts';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { sendJson, useResource } from '../projects/useResource';
import { NewSessionButton } from '../sessions/NewSessionDialog';
import { apiRequest } from '../../lib/api';
import { ApiError, PRACTICE_OPERATIONS, type DocumentView, type Locale, type RunOperation, type RunView, type SessionView } from '../../lib/api-types';
import { useRun } from './useRun';
import { RunTimeline } from './RunTimeline';
import { RelatedDocuments, RunResults } from './RunResults';
import { ReportListCard } from './EvaluationReportView';
import { AiLabel } from '@/components/AiMark';
import { ApprovalCard } from './ApprovalCard';
import { nextStep } from '../overview/nextStep';
import { SkillAdvice } from './SkillAdvice';
import { TailorCard } from './TailorCard';
import { ApplyCard } from './ApplyCard';
import { BusyNote } from '@/components/BusyNote';
import { Alert } from '@/components/ui/alert';
import { CompanyMark } from '@/components/CompanyMark';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const copy = {
  th: { draftCta: 'ร่างจดหมายสมัครงาน', appliedCta: 'ฉันสมัครแล้ว', appliedNote: 'บันทึกสถานะเท่านั้น ระบบไม่ได้ส่งใบสมัครให้', practiseCta: 'ซ้อมสัมภาษณ์งานนี้', undo: 'ยกเลิกที่บันทึกว่าสมัครแล้ว', title: 'เซสชัน', unpaired: 'ยังไม่ได้จับคู่', unpairedBody: 'เซสชันเก่านี้ไม่ได้จับคู่ CV กับงาน จึงดูได้อย่างเดียว เริ่มเซสชันใหม่เพื่อประเมินและร่างเอกสาร', startPaired: 'เริ่มเซสชันที่จับคู่', outdated: 'มี CV เวอร์ชันใหม่', outdatedBody: 'เซสชันนี้ใช้ CV เวอร์ชันเก่า เริ่มเซสชันใหม่ด้วย CV ล่าสุดกับงานเดิม', outdatedBtn: 'เริ่มด้วย CV ล่าสุด', eval: 'การประเมิน', evalNone: 'ยังไม่มีผลประเมิน', draft: 'ร่างเอกสาร', draftBody: 'เลือกประเภทเอกสารที่ต้องการ เอเจนต์จะร่างจาก CV และงานคู่นี้', letter: 'จดหมายสมัครงาน', message: 'ข้อความสมัครงาน', lang: 'ภาษาเอกสาร', docs: 'เอกสารที่ร่างในเซสชันนี้', noDocs: 'ยังไม่มีเอกสาร', open: 'เปิดเอกสาร', revise: 'สั่งแก้', reviseHint: 'บอกสิ่งที่ต้องการแก้ ระบบจะสร้างเวอร์ชันใหม่ของเอกสารนี้', send: 'ส่งคำสั่งแก้', cancel: 'หยุดงาน', retry: 'ลองใหม่เป็นงานใหม่', refresh: 'โหลดสถานะใหม่', noProvider: 'ยังไม่ได้ตั้งค่าเกตเวย์ AI เปิดการตั้งค่าเกตเวย์ AI เพื่อตรวจสอบการเชื่อมต่อ', settings: 'ไปที่การตั้งค่า', version: 'เวอร์ชัน', you: 'คุณ', cvPage: 'เปิดหน้า CV', jobPage: 'ดูรายละเอียดงาน', letterAsk: 'ร่างจดหมายสมัครงาน (cover letter) สำหรับงานนี้', messageAsk: 'ร่างข้อความสมัครงานสั้น ๆ สำหรับส่งผู้รับสมัครงานนี้', th: 'ไทย', en: 'English', readOnly: 'ข้อความในเซสชันเก่า (ดูอย่างเดียว)', redraft: 'ร่างใหม่ทั้งฉบับ', redraftConfirm: 'จะสร้างเวอร์ชันใหม่ของเอกสารเดิม', redraftBody: 'เอเจนต์จะร่างใหม่ทั้งฉบับและเพิ่มเป็นเวอร์ชันใหม่ของเอกสารนี้ เวอร์ชันเดิมยังอยู่ในประวัติ', confirm: 'ร่างใหม่', dismiss: 'ยกเลิก', edit: 'แก้ไข', reviseAi: 'สั่งแก้ด้วย AI', draftStatus: 'สถานะการร่างเอกสาร' },
  en: { draftCta: 'Draft cover letter', appliedCta: 'I applied', appliedNote: 'Records the stage only. We do not submit anything.', practiseCta: 'Practise this interview', undo: 'Undo: not applied yet', title: 'Session', unpaired: 'Not paired', unpairedBody: 'This older session has no CV and job pair, so it is read-only. Start a new session to evaluate and draft.', startPaired: 'Start a paired session', outdated: 'A newer CV version exists', outdatedBody: 'This session uses an older CV version. Start a new session with the latest CV and the same job.', outdatedBtn: 'Start with latest CV', eval: 'Evaluation', evalNone: 'No evaluation yet', draft: 'Draft documents', draftBody: 'Pick a document type. The agent drafts it from this CV and job pair.', letter: 'Cover letter', message: 'Application message', lang: 'Document language', docs: 'Documents drafted in this session', noDocs: 'No documents yet', open: 'Open document', revise: 'Revise', reviseHint: 'Say what to change. A new version of this document is created.', send: 'Send revision request', cancel: 'Stop run', retry: 'Retry as a new run', refresh: 'Refresh status', noProvider: 'AI is unavailable because the gateway is not configured. Open AI gateway settings to check the connection.', settings: 'Open settings', version: 'Version', you: 'You', cvPage: 'Open CV page', jobPage: 'View job details', letterAsk: 'Draft a cover letter for this job.', messageAsk: 'Draft a short application message to send to the recruiter for this job.', th: 'ไทย', en: 'English', readOnly: 'Messages from the older session (read-only)', redraft: 'Redraft from scratch', redraftConfirm: 'This creates a new version of the existing document', redraftBody: 'The agent drafts the whole document again and adds it as a new version of this document. Earlier versions stay in the history.', confirm: 'Redraft', dismiss: 'Cancel', edit: 'Edit', reviseAi: 'Revise with AI', draftStatus: 'Draft status' },
};
type DraftKind = 'cover_letter' | 'application_message';
type PrimaryAction = { label: string; onClick: () => void; disabled?: boolean; title?: string; note?: string };
const ACTIVE = ['queued', 'running', 'waiting_approval'];

function ReviseBox({ c, projectId, docId, busy, onSubmit }: { c: typeof copy.en; projectId: string; docId: string; busy: boolean; onSubmit: (text: string) => Promise<boolean> }) {
  const [text, setText] = useDraft(projectId, docId, 'revise');
  const [open, setOpen] = useState(text !== '');
  const id = useId();
  const gate = useRunGate();
  return <div className="grid gap-2">
    <Button type="button" variant="ghost" size="sm" className="justify-self-start" aria-expanded={open} onClick={() => setOpen(value => !value)}><ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />{c.reviseAi}</Button>
    {open && <form className="grid gap-2" onSubmit={event => { event.preventDefault(); if (text.trim() && !busy) void onSubmit(text.trim()).then(ok => { if (ok) setText(''); }); }}>
      <label className="text-sm font-medium" htmlFor={id}>{c.revise}</label>
      <Textarea id={id} rows={2} maxLength={500} value={text} placeholder={c.reviseHint} onChange={event => setText(event.target.value)} disabled={busy} />
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{text.length}/500</span><Button type="submit" size="sm" variant="outline" busy={busy} disabled={busy || !text.trim()} title={gate.title}>{c.send}</Button></div>
    </form>}
  </div>;
}

function DocCard({ c, base, projectId, doc, busy, onRevise }: { c: typeof copy.en; base: string; projectId: string; doc: DocumentView; busy: boolean; onRevise: (text: string) => Promise<boolean> }) {
  const ref = useRef<HTMLDivElement>(null);
  // The document list omits content; the latest revision carries it.
  const revisions = useResource<{ revision: number; content_markdown?: string | null }[]>(`/projects/${projectId}/documents/${doc.id}/revisions`);
  const content = doc.content_markdown ?? [...(revisions.data ?? [])].sort((a, b) => b.revision - a.revision)[0]?.content_markdown ?? null;
  return <Card><CardContent className="grid gap-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 break-words font-semibold">{doc.title}{doc.latest_revision ? <span className="ms-2 text-sm font-normal text-muted-foreground">{c.version} {doc.latest_revision.revision}</span> : null}</h3>{doc.source_run_id && <AiLabel check />}</div>
    {content && <Link to={`${base}/documents/${doc.id}`} className="relative block max-h-28 overflow-hidden rounded-md text-foreground no-underline" title={c.open}>
      <div ref={ref}><Markdown>{content}</Markdown></div><div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-card/80" aria-hidden="true" /></Link>}
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" variant="outline" ><Link to={`${base}/documents/${doc.id}?edit=1`}><Pencil className="size-4" aria-hidden="true" />{c.edit}</Link></Button>
      {content && <CopyButton source={ref} markdown={content} />}
    </div>
    <ReviseBox c={c} projectId={projectId} docId={doc.id} busy={busy} onSubmit={onRevise} />
  </CardContent></Card>;
}

export function SessionPage() {
  const { t, i18n } = useTranslation('sessionWorkspace');
  const locale: Locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const gatewayHelp = useGatewayHelp(locale);
  const c = { ...copy[locale], title: t('title'), eval: t('evaluation'), evalNone: t('evalNone'), draft: t('draft'), draftBody: t('draftBody'), letter: t('letter'), message: t('message'), lang: t('lang'), docs: t('docs'), noDocs: t('noDocs'), open: t('open'), revise: t('revise'), reviseHint: t('reviseHint'), send: t('send'), cancel: t('cancel'), retry: t('retry'), refresh: t('refresh'), settings: t('settings'), version: t('version'), cvPage: t('cvPage'), jobPage: t('jobPage'), letterAsk: t('letterAsk'), messageAsk: t('messageAsk'), readOnly: t('readOnly'), unpaired: t('unpaired'), unpairedBody: t('unpairedBody'), startPaired: t('startPaired'), outdated: t('outdated'), outdatedBody: t('outdatedBody'), outdatedBtn: t('outdatedBtn'), redraft: t('redraft'), redraftConfirm: t('redraftConfirm'), redraftBody: t('redraftBody'), confirm: t('confirm'), dismiss: t('dismiss'), edit: t('edit'), reviseAi: t('reviseAi') };
  const { projectId = '', sessionId = '' } = useParams();
  const base = `/app/projects/${projectId}`;
  const session = useResource<SessionView>(`/projects/${projectId}/sessions/${sessionId}`);
  const documents = useResource<DocumentView[]>(`/projects/${projectId}/documents`);
  const trashed = useResource<DocumentView[]>(`/projects/${projectId}/documents/trash`);
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
  const jobs = useResource<import('../../lib/api-types').JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const workflow = useRun(projectId, sessionId);
  const [outputLanguage, setOutputLanguage] = useState<Locale>(locale);
  const outputLanguageId = useId();
  // Contract (UX_SIMPLIFY_PLAN 3.1): `?start=evaluate` means "run evaluate_job once on arrival".
  // On first load with this param, call startRun('evaluate_job', '') and then navigate to the same URL
  // without `start` (replace: true) so reload/back never start a second run. W3 implements; W2 links here.
  const [params, setParams] = useSearchParams();
  const initialTab = params.get('tab');
  const startParam = params.get('start');
  const autoStarted = useRef(false);
  const [tab, setTab] = useState(initialTab && ['evaluation', 'documents', 'answers', 'practice'].includes(initialTab) ? initialTab : 'evaluation');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [accountError, setAccountError] = useState('');
  const gate = useRunGate();
  const last = useRef<{ operation: RunOperation; instructions: string; documentId?: string; draftKind?: DraftKind } | null>(null);
  const [confirmKind, setConfirmKind] = useState<DraftKind | null>(null);
  const status = workflow.run?.status;
  const runId = workflow.run?.id;
  const { reload: reloadRuns } = runs; const { reload: reloadDocs } = documents; const { reload: reloadTrash } = trashed;
  // Keep the selected tab inside the scrolling tab row on phones.
  useEffect(() => { document.querySelector<HTMLElement>('[data-session-tabs] [role=tab][data-state=active]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }, [tab]);
  useEffect(() => { reloadRuns(); if (status && !ACTIVE.includes(status)) { reloadDocs(); reloadTrash(); } }, [runId, status, reloadRuns, reloadDocs, reloadTrash]);
  const [appliedUndo, setAppliedUndo] = useState<string | null>(null);
  // `?start=evaluate`: strip the param first, then start once. The ref stops a second POST on re-render or StrictMode.
  useEffect(() => {
    if (startParam !== 'evaluate' || autoStarted.current) return;
    if (session.status !== 'ready' || runs.status !== 'ready' || workflow.loading) return;
    autoStarted.current = true;
    setParams(next => { next.delete('start'); return next; }, { replace: true });
    const hasEval = (runs.data ?? []).some(run => run.session_id === sessionId && run.operation === 'evaluate_job');
    if (session.data?.cv_revision_id && session.data.job_revision_id && !hasEval && !(status && ACTIVE.includes(status))) void startRun('evaluate_job', '');
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const resources = [session, documents, runs];
  if (resources.some(item => item.status === 'loading' && item.data === undefined) || workflow.loading) return <LoadingState />;
  if (session.errorStatus === 404) return <MissingResource />;
  if (resources.some(item => item.status === 'error')) return <ErrorState onRetry={() => resources.forEach(item => item.reload())} />;
  const current = session.data;
  if (!current) return <MissingResource />;
  const paired = Boolean(current.cv_revision_id && current.job_revision_id);
  const jobRevision = (jobs.data ?? []).find(item => item.id === current.job_revision_id);
  const active = Boolean(status && ACTIVE.includes(status));
  const sessionRuns = (runs.data ?? []).filter(run => run.session_id === sessionId && !PRACTICE_OPERATIONS.includes(run.operation));
  const evalRun = sessionRuns.find(run => run.operation === 'evaluate_job') ?? null;
  const evalReport = evalRun?.evaluation_result?.report ?? null;
  const draftRunIds = new Set(sessionRuns.filter(run => run.operation === 'draft_documents').map(run => run.id));
  const drafted = (documents.data ?? []).filter(doc => doc.source_run_id && draftRunIds.has(doc.source_run_id));
  const busy = active || submitting || workflow.submitting;

  async function startRun(operation: RunOperation, instructions: string, documentId?: string, retryOf?: string, draftKind?: DraftKind): Promise<boolean> {
    setSubmitting(true); setError(''); setAccountError('');
    const key = crypto.randomUUID();
    try {
      await apiRequest<RunView>(`/async/projects/${projectId}/agent-runs`, {
        method: 'POST', headers: { 'Idempotency-Key': key },
        body: JSON.stringify({ session_id: sessionId, operation, output_language: outputLanguage, idempotency_key: key, ...(instructions ? { owner_instructions: instructions } : {}), ...(documentId ? { document_id: documentId } : {}), ...(draftKind ? { draft_kind: draftKind } : {}), ...(retryOf ? { retry_of_id: retryOf } : {}) }),
      });
      last.current = { operation, instructions, documentId, draftKind };
      await workflow.reload().catch(() => undefined); reloadRuns();
      return true;
    } catch (caught) {
      const account = accountErrorText(t, caught, i18n.language);
      if (account) { setAccountError(account); return false; }
      setError(caught instanceof ApiError && caught.code === 'gateway_unconfigured' ? 'provider' : caught instanceof ApiError ? caught.message_key : 'errors.request_failed');
      return false;
    } finally { setSubmitting(false); }
  }
  const retry = () => {
    const previous = last.current ?? (workflow.run?.operation === 'evaluate_job' ? { operation: 'evaluate_job' as const, instructions: '' } : null);
    if (previous && workflow.run) void startRun(previous.operation, previous.instructions, previous.documentId, workflow.run.id, previous.draftKind);
  };
  const failed = status && !ACTIVE.includes(status) && status !== 'completed' && workflow.run?.operation !== 'export_document';
  const liveDoc = (kind: DraftKind) => drafted.find(doc => doc.document_type === kind);
  const draftNow = (kind: DraftKind) => { setConfirmKind(null); void startRun('draft_documents', kind === 'cover_letter' ? c.letterAsk : c.messageAsk, undefined, undefined, kind); };
  const askDraft = (kind: DraftKind) => liveDoc(kind) ? setConfirmKind(kind) : draftNow(kind);
  const kindLabel = (kind: DraftKind) => kind === 'cover_letter' ? c.letter : c.message;
  const draftLabel = (kind: DraftKind) => liveDoc(kind) ? `${c.redraft}: ${kindLabel(kind)}` : kindLabel(kind);
  const sessionRunIds = new Set(sessionRuns.map(run => run.id));
  const relatedDocs = (documents.data ?? []).filter(doc => doc.source_run_id && sessionRunIds.has(doc.source_run_id));
  const urgent = Boolean(workflow.pendingApproval || status === 'needs_input' || status === 'waiting_approval');
  const reloadRun = () => void workflow.reload().catch(() => undefined);
  const operation = workflow.run?.operation;
  const needsTab = operation === 'apply_prepare' ? 'answers' : 'documents';
  // One primary action per state: run states first (answer, retry), then the shared next-step rule.
  const waiting = status === 'needs_input' || status === 'waiting_approval' ? runId : undefined;
  const scored = evalRun?.status === 'completed';
  const step = nextStep({ hasCv: true, extractionRunning: false, waitingRunId: waiting, job: { id: current.job_revision_id ?? '', stage: jobRevision?.application_status, session: { id: sessionId, scored: Boolean(scored), drafted: drafted.length > 0 } } });
  const setStage = async (stage: 'applied' | 'saved') => {
    const before = jobRevision?.application_status ?? 'saved';
    setSubmitting(true); setError('');
    try { await sendJson(`/projects/${projectId}/jobs/${current.job_revision_id}/application-status`, 'PATCH', { application_status: stage }); setAppliedUndo(stage === 'applied' ? before : null); jobs.reload(); }
    catch { setError('errors.request_failed'); } finally { setSubmitting(false); }
  };
  const blocked = busy || gate.blocked;
  const primary: PrimaryAction | null = workflow.pendingApproval ? null
    : status === 'waiting_approval' ? { label: c.refresh, onClick: reloadRun }
    : status === 'needs_input' ? (tab === needsTab ? null : { label: operation === 'tailor_cv' ? t('panel.reviewChanges') : operation === 'apply_prepare' ? t('panel.answerQuestions') : t('run.openDocuments'), onClick: () => setTab(needsTab) })
    : failed && (last.current || operation === 'evaluate_job') ? { label: c.retry, onClick: retry, disabled: blocked, title: gate.title }
    : active ? null
    : step.key === 'getFitScore' ? { label: t('evaluate'), onClick: () => void startRun('evaluate_job', ''), disabled: blocked, title: gate.title }
    : step.key === 'draftLetter' ? { label: c.draftCta, onClick: () => askDraft('cover_letter'), disabled: blocked, title: gate.title }
    : step.key === 'markApplied' ? { label: c.appliedCta, onClick: () => void setStage('applied'), disabled: blocked, note: c.appliedNote }
    : step.key === 'practise' ? { label: c.practiseCta, onClick: () => setTab('practice') }
    : null;
  const failReason = failed ? t((workflow.events.filter(event => event.data.message_key).pop()?.data.message_key) ?? 'failReason', { defaultValue: t('failReason') }) : '';
  const dot = (state: 'done' | 'working' | 'attention' | 'failed' | null) => state ? <><span aria-hidden="true" className={cn('ms-2 inline-block size-2 rounded-full', state === 'done' && 'bg-success', state === 'working' && 'animate-pulse bg-primary', state === 'attention' && 'bg-warning', state === 'failed' && 'bg-destructive')} /><span className="sr-only">{t(`dots.${state}`)}</span></> : null;
  const runDot = (run?: RunView | null) => !run ? null : ACTIVE.includes(run.status) ? 'working' as const : run.status === 'completed' ? 'done' as const : run.status === 'needs_input' ? 'attention' as const : 'failed' as const;
  const headline = paired ? current.job_title ?? current.title : current.title;
  // Job + company + CV identify the session; several sessions can share a job but never the same CV/job pair.
  const cvLine = paired && current.cv_name ? `CV: ${current.cv_name}${current.cv_revision != null ? ` · v${current.cv_revision}` : ''}` : null;
  const subline = [paired ? current.job_company : null, headline !== current.title && !current.title.includes(headline ?? '') ? current.title : null, cvLine].filter(Boolean).join(' · ');
  const tabClass = 'min-h-12 shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none';
  // Documents and answers both use this language; it shows in whichever of the two tabs is open (one id at a time).
  const languagePicker = <div className="grid gap-1"><div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium"><label htmlFor={outputLanguageId}>{t('outputLanguage')}</label><Select id={outputLanguageId} aria-describedby={`${outputLanguageId}-hint`} className="w-40 max-w-full" value={outputLanguage} onChange={event => setOutputLanguage(event.target.value === 'en' ? 'en' : 'th')} disabled={busy}><option value="th">{t('thai')}</option><option value="en">{t('english')}</option></Select></div>
    <p id={`${outputLanguageId}-hint`} className="text-xs text-muted-foreground">{t('outputLanguageHint')}</p></div>;
  return <section className="flex min-w-0 flex-col gap-6 lg:gap-8">
    <div className="grid gap-1">
    <header className="flex min-w-0 items-start gap-4">{paired && current.job_company && <span className="max-sm:hidden"><CompanyMark name={current.job_company} size={48} /></span>}<div className="min-w-0"><h1 className="break-words text-3xl font-semibold tracking-tight">{headline}</h1>{subline && <p className="mt-1 break-words text-muted-foreground">{subline}</p>}</div></header>
    </div>
    {paired ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-6">
      <p className="text-sm font-semibold sm:col-span-2 lg:col-span-1">{t('pair.label')}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-2"><FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="text-sm text-muted-foreground">{t('pair.cv')}</span><Link className="inline-flex min-h-11 items-center break-words font-medium text-primary hover:underline lg:min-h-10" to={`${base}/profile`} title={c.cvPage}>{current.cv_name} · v{current.cv_revision}</Link><CvPreviewButton projectId={projectId} fileId={current.cv_file_id} name={current.cv_name ?? 'CV'} revision={current.cv_revision} variant="ghost" className="h-8 px-2" /></div>
      <div className="flex min-w-0 flex-wrap items-center gap-2"><Briefcase className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="text-sm text-muted-foreground">{t('pair.job')}</span><Link className="inline-flex min-h-11 items-center break-words font-medium text-primary hover:underline lg:min-h-10" to={`${base}/jobs/${current.job_revision_id}`} title={c.jobPage}>{current.job_title}{current.job_company ? ` · ${current.job_company}` : ''}</Link><Badge variant="outline">{jobRevision ? t('pair.version', { n: jobRevision.revision }) : `${t('identity.unknownRevision')} ${current.job_revision_id}`}</Badge></div>
    </div> : <Badge variant="outline" className="w-fit">{c.unpaired}</Badge>}

    {!paired && <Card><CardContent className="grid gap-3 p-4"><p className="text-sm">{c.unpairedBody}</p><NewSessionButton projectId={projectId} className="justify-self-start">{c.startPaired}</NewSessionButton></CardContent></Card>}
    {paired && current.cv_outdated && <Alert severity="warning" action={<NewSessionButton size="sm" variant="outline" projectId={projectId} job={{ savedId: current.job_revision_id ?? undefined }} cvName={current.cv_name ?? undefined}>{c.outdatedBtn}</NewSessionButton>}><p className="font-medium">{c.outdated}</p><p className="text-muted-foreground">{c.outdatedBody}</p></Alert>}
    {!paired && workflow.messages.length > 0 && <section className="grid gap-3" aria-label={c.readOnly}><h2 className="text-base font-semibold">{c.readOnly}</h2>{workflow.messages.map(item => item.role === 'user' ? <article key={item.id} className="flex flex-col items-end gap-1"><p className="text-xs text-muted-foreground">{c.you}</p><p className="plain-content chat-text m-0 max-w-[85%] rounded-2xl rounded-br-sm bg-primary-fill px-4 py-2 text-primary-fill-foreground">{item.content}</p></article> : <article key={item.id} className="flex items-start gap-3"><span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-primary-fill text-primary-fill-foreground" aria-hidden="true"><Bot className="size-4" /></span><p className="plain-content chat-text m-0 min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm border bg-card px-4 py-2">{item.content}</p></article>)}</section>}
    {error === 'provider' && <Alert severity="warning" role="alert" action={gatewayHelp.isAdmin && <Button asChild size="sm" variant="outline"><Link to="/app/settings?section=gateway">{c.settings}</Link></Button>}><p className="font-medium">{gatewayHelp.isAdmin ? c.noProvider : gatewayHelp.contactText}</p></Alert>}
    {accountError && <Alert severity="error">{accountError}</Alert>}
    {error && error !== 'provider' && <Alert severity="error">{t(error, { defaultValue: t('pages.loadError') })}</Alert>}

    {paired && <>
      {(status === 'queued' || status === 'running') && <BusyNote announce={false} bar className="lg:hidden" label={status === 'queued' ? (i18n.language.startsWith('th') ? 'เอเจนต์รับงานแล้ว รอคิว' : 'The agent has the task and is queued') : (i18n.language.startsWith('th') ? 'เอเจนต์กำลังประมวลผล' : 'The agent is processing')} detail={i18n.language.startsWith('th') ? 'หน้านี้อัปเดตเองเมื่อมีความคืบหน้า' : 'This page updates by itself as work progresses'} />}
      <section aria-labelledby="next-heading" className={cn('grid min-w-0 gap-3 rounded-xl border bg-card p-4 sm:p-5', urgent && 'border-primary')}>
        <h2 id="next-heading" className="sr-only">{t('panel.title')}</h2>
        {workflow.run && <RunTimeline locale={locale} run={workflow.run} events={workflow.events} cancellationPending={workflow.cancellationPending} />}
        {failed && <Alert severity="error" role="alert"><p className="font-medium">{t('failTitle')}</p><p className="text-sm">{failReason}</p></Alert>}
        {status === 'needs_input' && <Alert severity="warning" className="font-medium">{t('run.needsInput')}</Alert>}
        {workflow.error && <Alert severity="error" action={<Button type="button" variant="outline" size="sm" onClick={reloadRun}>{t('refresh')}</Button>}>{t(workflow.error, { defaultValue: t('pages.loadError') })}</Alert>}
        <ApprovalCard approval={workflow.pendingApproval} locale={locale} busy={workflow.submitting} onDecision={(id, decision) => void workflow.decideApproval(id, decision)} onRefresh={reloadRun} />
        <div className="flex flex-wrap items-center gap-2">
          {primary && <Button type="button" className="whitespace-normal" disabled={primary.disabled} title={primary.title} onClick={primary.onClick}>{primary.label}</Button>}
          {appliedUndo && jobRevision?.application_status === 'applied' && <Button type="button" variant="ghost" onClick={() => void setStage(appliedUndo as 'saved').then(() => setAppliedUndo(null))} disabled={busy}>{c.undo}</Button>}
          {active && <Button type="button" variant="outline" disabled={workflow.submitting || workflow.cancellationPending} onClick={() => void workflow.cancel()}>{t('cancel')}</Button>}
        </div>
        {primary?.note && <p className="text-xs text-muted-foreground">{primary.note}</p>}
        {primary && status === 'needs_input' && operation === 'tailor_cv' && <p className="text-xs text-muted-foreground">{t('panel.reviewHint')}</p>}
      </section>
      <Tabs value={tab} onValueChange={setTab} className="grid min-w-0 gap-4">
        <div className="min-w-0 border-b">
          <TabsList data-session-tabs aria-label={c.title} className="tabs-scroll h-auto min-w-0 max-w-full justify-start rounded-none max-sm:flex-nowrap max-sm:overflow-x-auto border-b-0 bg-transparent p-0">
            <TabsTrigger value="evaluation" className={tabClass}>{t('tabs.evaluation')}{dot(runDot(evalRun))}</TabsTrigger>
            <TabsTrigger value="documents" className={tabClass}>{t('tabs.documents')}{dot(runDot(sessionRuns.find(run => run.operation === 'draft_documents') ?? sessionRuns.find(run => run.operation === 'tailor_cv')))}</TabsTrigger>
            <TabsTrigger value="answers" className={tabClass}>{t('tabs.answers')}{dot(runDot(sessionRuns.find(run => run.operation === 'apply_prepare')))}</TabsTrigger>
            <TabsTrigger value="practice" className={tabClass} aria-label={practiceCopy[locale].tab}><span aria-hidden="true" className="max-sm:hidden">{practiceCopy[locale].tab}</span><span aria-hidden="true" className="sm:hidden">{locale === 'th' ? 'ซ้อม' : 'Practice'}</span></TabsTrigger>
          </TabsList>
        </div>
        <div className="grid min-w-0 gap-4">
            <TabsContent value="evaluation" forceMount tabIndex={-1} className={`grid gap-4 ${tab === 'evaluation' ? '' : 'hidden'}`}>
              {evalRun ? <>
                <RunResults projectId={projectId} locale={locale} run={evalRun} documents={documents.data ?? []} trashedDocuments={trashed.data ?? []} showDocuments={false} />
                {evalRun.status === 'completed' && evalRun.evaluation_result?.skill_coverage && <SkillAdvice projectId={projectId} locale={locale} coverage={evalRun.evaluation_result.skill_coverage} />}
                <RelatedDocuments projectId={projectId} documents={relatedDocs} />
              </> : <section aria-labelledby="eval-empty-heading" className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
                <div className="grid gap-2"><h2 id="eval-empty-heading" className="text-lg font-semibold">{t('empty.title')}</h2><p className="max-w-xl text-muted-foreground">{t('empty.body')}</p></div>
                <ul className="grid max-w-xl gap-2 text-sm">{(t('empty.gets', { returnObjects: true }) as string[]).map(line => <li key={line} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /><span className="min-w-0 break-words">{line}</span></li>)}</ul>
                <p className="text-sm text-muted-foreground">{t('result.notPrediction')}</p>
              </section>}
            </TabsContent>
            <TabsContent value="documents" forceMount className={`grid gap-4 ${tab === 'documents' ? '' : 'hidden'}`}>
              <section className="grid gap-3 rounded-xl border bg-card p-5 sm:p-6"><h2 className="text-lg font-semibold">{c.draft}</h2><p className="text-sm text-muted-foreground">{c.draftBody}</p>{tab === 'documents' && languagePicker}<div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" disabled={busy || gate.blocked} title={gate.title} onClick={() => askDraft('cover_letter')}>{draftLabel('cover_letter')}</Button><Button type="button" variant="outline" disabled={busy || gate.blocked} title={gate.title} onClick={() => askDraft('application_message')}>{draftLabel('application_message')}</Button></div></section>
              <ReportListCard kind="cvChanges" items={evalReport?.cv_changes} />
              <TailorCard projectId={projectId} sessionId={sessionId} locale={locale} outputLanguage={outputLanguage} busy={busy} run={sessionRuns.find(run => run.operation === 'tailor_cv') ?? null} onChanged={() => { reloadRun(); reloadRuns(); }} />
              <section className="grid gap-3"><h2 className="text-lg font-semibold">{c.docs}</h2>{drafted.length === 0 ? <p className="text-sm text-muted-foreground">{c.noDocs}</p> : drafted.map(doc => <DocCard key={doc.id} c={c} base={base} projectId={projectId} doc={doc} busy={busy || gate.blocked} onRevise={text => startRun('draft_documents', text, doc.id)} />)}</section>
            </TabsContent>
            <TabsContent value="answers" forceMount className={`grid gap-4 ${tab === 'answers' ? '' : 'hidden'}`}>{tab === 'answers' && languagePicker}{current.job_revision_id && <ApplyCard projectId={projectId} jobId={current.job_revision_id} sessionId={sessionId} locale={locale} outputLanguage={outputLanguage} busy={busy} runs={sessionRuns} onChanged={() => { reloadRun(); reloadRuns(); }} />}</TabsContent>
            <TabsContent value="practice" forceMount className={`grid gap-4 ${tab === 'practice' ? '' : 'hidden'}`}><PracticeTab projectId={projectId} sessionId={sessionId} locale={locale} prep={evalReport?.interview_prep} /></TabsContent>
        </div>
      </Tabs>
      {sessionRuns.length > 1 && <Link to={`${base}/console`} className="inline-flex min-h-11 w-fit items-center text-sm text-primary hover:underline">{t('openHistory')}</Link>}
    {confirmKind && <Dialog open onOpenChange={open => { if (!open) setConfirmKind(null); }}><DialogContent>
      <DialogTitle>{c.redraftConfirm}</DialogTitle><DialogDescription>{kindLabel(confirmKind)}: {c.redraftBody}</DialogDescription>
      <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="outline" >{c.dismiss}</Button></DialogClose><Button type="button" onClick={() => draftNow(confirmKind)}>{c.confirm}</Button></div>
    </DialogContent></Dialog>}
    </>}
  </section>;
}
