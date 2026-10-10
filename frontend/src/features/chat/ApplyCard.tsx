import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '../../lib/api';
import { ApiError, type ApplyPack, type ApplyQuestion, type JobRevisionView, type Locale, type RunOperation, type RunView } from '../../lib/api-types';
import { useResource } from '../projects/useResource';

const copy = {
  th: { title: 'สมัครงาน', yourAnswer: 'คำตอบของคุณ', confirm: 'แนะนำจากข้อเท็จจริงของคุณ — โปรดยืนยัน', waiting: 'รอคำตอบจากคุณ', answerHere: 'กรอกคำตอบของคุณ', yes: 'ใช่', no: 'ไม่ใช่', choose: 'เลือก', save: 'บันทึกคำตอบ', stillMissing: 'ยังขาดคำตอบที่ต้องตอบ', savedReady: 'บันทึกแล้ว ชุดคำตอบพร้อมใช้', savedMore: 'บันทึกแล้ว แต่ยังมีข้อที่ต้องตอบ', run_not_awaiting_input: 'งานนี้ไม่ได้รอคำตอบแล้ว', invalid_answer: 'คำตอบไม่ตรงรูปแบบของคำถาม', body: 'เอเจนต์เตรียมคำตอบจากข้อเท็จจริงในคลังประสบการณ์เท่านั้น ระบบไม่ส่งใบสมัครให้ คุณส่งเองบนเว็บไซต์บริษัท', pack: 'ชุดคำตอบล่าสุด', ready: 'พร้อมใช้', parked: 'ยังไม่ครบ', notAnswerable: 'ตอบไม่ได้', reasonLabel: 'เหตุผล', reasons: { not_answerable: 'ไม่มีข้อเท็จจริงในคลังประสบการณ์ที่รองรับคำตอบนี้', invalid_answer: 'คำตอบที่ได้ไม่ตรงรูปแบบของคำถาม', evidence_required: 'คำตอบไม่ได้อ้างอิงข้อเท็จจริงจากคลังประสบการณ์', unsupported_claim: 'คำตอบมีตัวเลข ทักษะ หรือชื่อที่ข้อเท็จจริงที่อ้างอิงไม่รองรับ', needs_confirmation: 'ต้องให้คุณยืนยันคำตอบนี้' } as Record<string, string>, evidence: 'หลักฐาน', copy: 'คัดลอก', copied: 'คัดลอกแล้ว', questions: 'คำถามในแบบฟอร์มสมัคร', qLabel: 'คำถาม', qKind: 'ชนิด', kinds: { text: 'ข้อความ', boolean: 'ใช่ / ไม่ใช่', choice: 'ตัวเลือก' }, choices: 'ตัวเลือก (คั่นด้วยจุลภาค)', required: 'ต้องตอบ', add: 'เพิ่มคำถาม', remove: 'ลบคำถามที่', prepare: 'เตรียมใบสมัคร', submit: 'ขอบันทึกว่าสมัครแล้ว', submitHint: 'สร้างคำขออนุมัติใน Agent Console เมื่ออนุมัติ ระบบเพียงบันทึกว่าสมัครแล้ว', followUp: 'ร่างข้อความติดตามผล', applied: 'สมัครแล้ว', approvals: 'ไปที่คำขออนุมัติ', sent: 'ส่งคำขอแล้ว', failed: 'ทำไม่สำเร็จ ลองอีกครั้ง', provider: 'ยังไม่ได้ตั้งค่าผู้ให้บริการ AI', document_busy: 'มีงานเตรียมใบสมัครของงานนี้กำลังทำอยู่', apply_pack_required: 'ยังไม่มีชุดคำตอบที่พร้อมใช้', already_applied: 'งานนี้บันทึกว่าสมัครแล้ว', application_not_applied: 'ต้องบันทึกว่าสมัครแล้วก่อน', needQuestion: 'ใส่คำถามอย่างน้อยหนึ่งข้อ' },
  en: { title: 'Apply', yourAnswer: 'Your answer', confirm: 'Suggested from your facts — confirm', waiting: 'Waiting for your answers', answerHere: 'Type your answer', yes: 'Yes', no: 'No', choose: 'Choose', save: 'Save answers', stillMissing: 'Still missing required answers', savedReady: 'Saved. The answer pack is ready.', savedMore: 'Saved. Some required answers are still missing.', run_not_awaiting_input: 'This run is no longer waiting for answers.', invalid_answer: 'An answer did not fit its question.', body: 'The agent prepares answers using only facts from your experience bank. Nothing is sent for you; you submit on the company site.', pack: 'Latest answer pack', ready: 'Ready', parked: 'Incomplete', notAnswerable: 'Not answerable', reasonLabel: 'Reason', reasons: { not_answerable: 'No fact in your experience bank supports an answer.', invalid_answer: 'The answer did not fit the question format.', evidence_required: 'The answer did not cite facts from your experience bank.', unsupported_claim: 'The answer states a number, skill or name the cited facts do not support.', needs_confirmation: 'You need to confirm this answer.' } as Record<string, string>, evidence: 'facts cited', copy: 'Copy', copied: 'Copied', questions: 'Application form questions', qLabel: 'Question', qKind: 'Type', kinds: { text: 'Text', boolean: 'Yes / no', choice: 'Choice' }, choices: 'Choices (comma separated)', required: 'Required', add: 'Add question', remove: 'Remove question', prepare: 'Prepare application', submit: 'Request submit', submitHint: 'Creates an approval in the Agent Console. Approving only records the job as applied.', followUp: 'Draft follow-up', applied: 'Applied', approvals: 'Open approvals', sent: 'Request sent', failed: 'Could not complete. Try again.', provider: 'The AI provider is not configured yet.', document_busy: 'An application is already being prepared for this job.', apply_pack_required: 'There is no ready answer pack yet.', already_applied: 'This job is already recorded as applied.', application_not_applied: 'Record the job as applied first.', needQuestion: 'Add at least one question.' },
};
type Row = { label: string; required: boolean; kind: ApplyQuestion['kind']; choices: string };
const blank = (): Row => ({ label: '', required: true, kind: 'text', choices: '' });
const field = 'min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const isPack = (payload: RunView['result_payload']): payload is ApplyPack => (payload as ApplyPack | null | undefined)?.kind === 'apply_pack';

function CopyAnswer({ text, c }: { text: string; c: (typeof copy)['en'] }) {
  const [done, setDone] = useState(false);
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return <Button type="button" variant="outline" size="sm" className="min-h-11 justify-self-start" onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setDone(false), 2000); }).catch(() => undefined); }}>{done ? c.copied : c.copy}</Button>;
}

export function ApplyCard({ projectId, jobId, sessionId, locale, outputLanguage, busy, runs, onChanged }: { projectId: string; jobId: string; sessionId: string; locale: Locale; outputLanguage: Locale; busy: boolean; runs: RunView[]; onChanged: () => void }) {
  const c = copy[locale];
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [working, setWorking] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string | boolean>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const jobs = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const { reload } = jobs;
  const runsKey = runs.map(run => `${run.id}:${run.status}`).join('|');
  useEffect(() => { reload(); }, [runsKey, reload]);
  const applied = jobs.data?.find(job => job.id === jobId)?.application_status === 'applied';
  const latest = runs.filter(run => run.operation === 'apply_prepare' && (run.status === 'completed' || run.status === 'needs_input') && isPack(run.result_payload)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  const pack = latest && isPack(latest.result_payload) ? latest.result_payload : null;
  const inFlight = runs.some(run => ['apply_prepare', 'apply_submit', 'draft_follow_up'].includes(run.operation) && ['queued', 'running'].includes(run.status));
  const waiting = latest?.status === 'needs_input' && pack?.state === 'parked';
  useEffect(() => {
    if (!waiting || !pack) return;
    setDrafts(current => {
      const next = { ...current };
      for (const a of pack.answers) if (a.answer === null && a.suggestion != null && !(a.question_id in next)) next[a.question_id] = a.suggestion;
      return next;
    });
  }, [latest?.id, waiting, pack]);
  const disabled = busy || working || inFlight;
  const errorText = (caught: unknown) => caught instanceof ApiError ? (caught.code === 'provider_configuration_required' ? c.provider : (c as unknown as Record<string, string>)[caught.code] ?? c.failed) : c.failed;
  const update = (index: number, patch: Partial<Row>) => setRows(current => current.map((row, i) => i === index ? { ...row, ...patch } : row));

  async function send(operation: RunOperation, extra: Record<string, unknown> = {}) {
    setWorking(true); setMessage(null);
    const key = crypto.randomUUID();
    try {
      await apiRequest<RunView>(`/projects/${projectId}/runs`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ session_id: sessionId, operation, output_language: outputLanguage, idempotency_key: key, ...extra }) });
      setMessage({ ok: true, text: c.sent }); onChanged();
    } catch (caught) { setMessage({ ok: false, text: errorText(caught) }); } finally { setWorking(false); }
  }
  function prepare() {
    const filled = rows.filter(row => row.label.trim());
    if (filled.length === 0) { setMessage({ ok: false, text: c.needQuestion }); return; }
    const questions: ApplyQuestion[] = filled.map((row, index) => {
      const label = row.label.trim();
      const choices = row.choices.split(',').map(item => item.trim()).filter(Boolean);
      return { id: `q${index + 1}`, label, required: row.required, kind: row.kind, ...(row.kind === 'choice' ? { choices: choices.length ? choices : ['-'] } : {}) };
    });
    void send('apply_prepare', { questions });
  }

  async function saveAnswers() {
    if (!latest) return;
    const answers = Object.fromEntries(Object.entries(drafts).filter(([, v]) => v !== '' && !(typeof v === 'string' && !v.trim())).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    if (Object.keys(answers).length === 0) return;
    setWorking(true); setMessage(null);
    try {
      const next = await apiRequest<RunView>(`/projects/${projectId}/runs/${latest.id}/input`, { method: 'POST', body: JSON.stringify({ answers }) });
      setDrafts({}); setMessage({ ok: true, text: next.status === 'completed' ? c.savedReady : c.savedMore }); onChanged();
    } catch (caught) { setMessage({ ok: false, text: errorText(caught) }); } finally { setWorking(false); }
  }
  function answerInput(q: ApplyPack['answers'][number], label: string) {
    const id = q.question_id; const value = drafts[id];
    const set = (v: string | boolean) => setDrafts(current => ({ ...current, [id]: v }));
    if (q?.kind === 'boolean') return <fieldset className="flex flex-wrap gap-4"><legend className="sr-only">{label}</legend>
      {([true, false] as const).map(v => <label key={String(v)} className="flex min-h-11 items-center gap-2"><input type="radio" className="size-4 accent-primary" name={`answer-${id}`} checked={value === v} onChange={() => set(v)} />{v ? c.yes : c.no}</label>)}</fieldset>;
    if (q?.kind === 'choice') return <select aria-label={label} className={field} value={typeof value === 'string' ? value : ''} onChange={event => set(event.target.value)}>
      <option value="">{c.choose}</option>{(q.choices ?? []).map(choice => <option key={choice} value={choice}>{choice}</option>)}</select>;
    return <textarea aria-label={label} className={field} rows={3} maxLength={4000} placeholder={c.answerHere} value={typeof value === 'string' ? value : ''} onChange={event => set(event.target.value)} />;
  }

  return <Card><CardHeader><CardTitle className="text-lg">{c.title}</CardTitle></CardHeader><CardContent className="grid gap-4">
    <p className="text-sm text-muted-foreground">{c.body}</p>
    {applied && <p><Badge variant="success">{c.applied}</Badge></p>}
    {pack && <section aria-labelledby={`pack-${latest?.id}`} className="grid gap-3 border-t pt-4">
      <h3 id={`pack-${latest?.id}`} className="flex flex-wrap items-center gap-2 font-semibold">{c.pack} <Badge variant={pack.state === 'ready' ? 'success' : 'warning'}>{pack.state === 'ready' ? c.ready : waiting ? c.waiting : c.parked}</Badge></h3>
      <ul className="grid gap-3">{pack.answers.map(answer => <li key={answer.question_id} className="grid gap-1 rounded-lg border p-3 text-sm">
        <span className="text-muted-foreground [overflow-wrap:anywhere]">{answer.label ?? answer.question_id}</span>
        {answer.answer === null && waiting
          ? <>{answer.suggestion != null && <Badge variant="secondary" className="justify-self-start">{c.confirm}</Badge>}{answerInput(answer, answer.label ?? answer.question_id)}</>
          : answer.answer === null
          ? <><Badge variant="warning" className="justify-self-start">{c.notAnswerable}</Badge><span>{c.reasonLabel}: {c.reasons[answer.reason ?? 'not_answerable'] ?? answer.reason}</span></>
          : <><span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{String(answer.answer)}</span>{answer.source === 'owner' ? <Badge variant="secondary" className="justify-self-start">{c.yourAnswer}</Badge> : <span className="text-xs text-muted-foreground">{answer.evidence_ids.length} {c.evidence}</span>}<CopyAnswer text={String(answer.answer)} c={c} /></>}
      </li>)}</ul>
      {waiting && <div className="grid gap-2">
        {pack.missing_required.length > 0 && <p role="status" className="text-sm">{c.stillMissing}: {pack.missing_required.map(id => pack.answers.find(a => a.question_id === id)?.label ?? id).join(', ')}</p>}
        <div><Button type="button" className="min-h-11" disabled={working || Object.keys(drafts).length === 0} onClick={() => void saveAnswers()}>{c.save}</Button></div>
      </div>}
    </section>}
    <form className="grid gap-3 border-t pt-4" onSubmit={event => { event.preventDefault(); prepare(); }}>
      <h3 className="font-semibold">{c.questions}</h3>
      {rows.map((row, index) => <fieldset key={index} className="grid gap-2 rounded-lg border p-3" disabled={disabled}>
        <legend className="px-1 text-sm text-muted-foreground">{index + 1}</legend>
        <label className="grid gap-1 text-sm">{c.qLabel}<input className={field} value={row.label} maxLength={400} onChange={event => update(index, { label: event.target.value })} /></label>
        <label className="grid gap-1 text-sm">{c.qKind}<select className={field} value={row.kind} onChange={event => update(index, { kind: event.target.value as Row['kind'] })}>{(['text', 'boolean', 'choice'] as const).map(kind => <option key={kind} value={kind}>{c.kinds[kind]}</option>)}</select></label>
        {row.kind === 'choice' && <label className="grid gap-1 text-sm">{c.choices}<input className={field} value={row.choices} onChange={event => update(index, { choices: event.target.value })} /></label>}
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={row.required} onChange={event => update(index, { required: event.target.checked })} />{c.required}</label>
        {rows.length > 1 && <Button type="button" variant="ghost" size="sm" className="min-h-11 justify-self-start" onClick={() => setRows(current => current.filter((_, i) => i !== index))}>{c.remove} {index + 1}</Button>}
      </fieldset>)}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={disabled || rows.length >= 40} onClick={() => setRows(current => [...current, blank()])}>{c.add}</Button>
        <Button type="submit" className="min-h-11" disabled={disabled}>{c.prepare}</Button>
      </div>
    </form>
    <div className="grid gap-2 border-t pt-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={disabled || latest?.status !== 'completed' || pack?.state !== 'ready' || applied} onClick={() => void send('apply_submit')}>{c.submit}</Button>
        {applied && <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => void send('draft_follow_up')}>{c.followUp}</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{c.submitHint} <Link className="text-primary hover:underline" to={`/app/projects/${projectId}/console?tab=approvals`}>{c.approvals}</Link></p>
    </div>
    {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? '' : 'text-destructive'}`}>{message.text}</p>}
  </CardContent></Card>;
}
