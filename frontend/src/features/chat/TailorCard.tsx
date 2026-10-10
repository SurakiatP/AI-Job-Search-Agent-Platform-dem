import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '../../lib/api';
import { ApiError, type Locale, type RunView, type TailorMode, type TailorPayload } from '../../lib/api-types';

const copy = {
  th: { title: 'ปรับ CV ให้เข้ากับงาน', waitingChoice: 'รอให้คุณเลือก', tailor_already_applied: 'ใช้ข้อเสนอของงานนี้ไปแล้ว ถ้าต้องการแก้อีกให้เริ่มปรับ CV ใหม่', body: 'เอเจนต์แก้ CV โดยอ้างอิงเฉพาะข้อเท็จจริงในคลังประสบการณ์ CV ต้นฉบับไม่ถูกแก้', mode: 'โหมด', autopilot: 'อัตโนมัติ', autopilotHint: 'แก้เป็นรอบ ๆ แล้วบันทึกเป็นเวอร์ชันใหม่ทันที', interactive: 'เลือกเอง', interactiveHint: 'ได้รายการข้อเสนอให้ติ๊กเลือกก่อนบันทึก', start: 'ปรับ CV', result: 'ผลการปรับ CV', stop: 'เหตุผลที่หยุด', coverage: 'ความครอบคลุมทักษะ', proposals: 'ข้อเสนอแก้ไข', text: 'ข้อความใหม่', find: 'แทนที่', append: 'เพิ่มต่อท้าย CV', evidence: 'หลักฐานที่อ้างอิง', status: 'สถานะ', proposed: 'รอเลือก', applied: 'ใช้แล้ว', rejected_by_gate: 'ไม่ผ่านการตรวจหลักฐาน', gateReason: 'ถูกปิดเพราะอ้างหลักฐานไม่ครบหรือไม่ตรงกับคลังประสบการณ์', pick: 'เลือกข้อเสนอ', apply: 'ใช้ข้อเสนอที่เลือก', none: 'ไม่มีข้อเสนอ', docs: 'ดูเอกสาร', started: 'ใช้ข้อเสนอแล้ว กำลังสร้างเวอร์ชันใหม่', failed: 'ใช้ข้อเสนอไม่สำเร็จ ลองอีกครั้ง', evidence_required: 'หลักฐานของข้อเสนอที่เลือกไม่ผ่านการตรวจ', tailor_nothing_to_apply: 'ข้อเสนอที่เลือกใช้กับ CV ปัจจุบันไม่ได้', document_busy: 'มีงานของเอกสารนี้กำลังทำอยู่ ลองใหม่ภายหลัง', startFailed: 'เริ่มปรับ CV ไม่สำเร็จ ลองอีกครั้ง', provider: 'ยังไม่ได้ตั้งค่าผู้ให้บริการ AI', stops: { full_coverage: 'ครอบคลุมทักษะที่งานต้องการครบแล้ว', no_gain: 'ไม่มีความคืบหน้าต่อเนื่อง 2 รอบ', max_rounds: 'ครบ 30 รอบ', time_budget: 'หมดเวลาที่กำหนด', interactive: 'ข้อเสนอรอบเดียว' } as Record<string, string> },
  en: { title: 'Tailor CV', waitingChoice: 'Waiting for your choice', tailor_already_applied: 'These proposals were already applied. Start a new tailoring run to change the CV again.', body: 'The agent edits your CV using only facts from your experience bank. Your original CV is never changed.', mode: 'Mode', autopilot: 'Autopilot', autopilotHint: 'Edits in rounds and saves a new version right away.', interactive: 'Interactive', interactiveHint: 'Returns proposals for you to pick before anything is saved.', start: 'Tailor CV', result: 'Tailoring result', stop: 'Stopped because', coverage: 'Skill coverage', proposals: 'Proposed edits', text: 'New text', find: 'Replaces', append: 'Adds to the end of the CV', evidence: 'Cited facts', status: 'Status', proposed: 'Proposed', applied: 'Applied', rejected_by_gate: 'Rejected by evidence check', gateReason: 'Disabled: its cited facts are missing or do not support the text.', pick: 'Select proposal', apply: 'Apply selected', none: 'No proposals', docs: 'Open documents', started: 'Applied. Creating the new version.', failed: 'Could not apply. Try again.', evidence_required: 'The evidence check failed for the selected proposals.', tailor_nothing_to_apply: 'The selected proposals do not fit the current CV.', document_busy: 'A task for this document is running. Try again later.', startFailed: 'Could not start tailoring. Try again.', provider: 'The AI provider is not configured yet.', stops: { full_coverage: 'Every required skill is covered', no_gain: 'No gain for 2 rounds in a row', max_rounds: 'Reached 30 rounds', time_budget: 'Time budget used', interactive: 'One round of proposals' } as Record<string, string> },
};
const pct = (value: number | null | undefined, locale: Locale) => value == null ? '—' : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
const isTailor = (payload: RunView['result_payload']): payload is TailorPayload => payload?.kind === 'tailor';

export function TailorCard({ projectId, sessionId, locale, outputLanguage, busy, run, onChanged }: { projectId: string; sessionId: string; locale: Locale; outputLanguage: Locale; busy: boolean; run: RunView | null; onChanged: () => void }) {
  const c = copy[locale];
  const [mode, setMode] = useState<TailorMode>('autopilot');
  const [picked, setPicked] = useState<number[]>([]);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [working, setWorking] = useState(false);
  const payload = (run?.status === 'completed' || run?.status === 'needs_input') && isTailor(run.result_payload) ? run.result_payload : null;
  const proposals = payload?.mode === 'interactive' ? payload.proposals ?? [] : [];
  const selectable = (status: string) => status === 'proposed';
  const errorText = (caught: unknown, fallback: string) => caught instanceof ApiError ? (caught.code === 'provider_configuration_required' ? c.provider : (c as unknown as Record<string, string>)[caught.code] ?? fallback) : fallback;

  async function start() {
    setWorking(true); setMessage(null);
    const key = crypto.randomUUID();
    try {
      await apiRequest<RunView>(`/projects/${projectId}/runs`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ session_id: sessionId, operation: 'tailor_cv', tailor_mode: mode, output_language: outputLanguage, idempotency_key: key }) });
      setPicked([]); onChanged();
    } catch (caught) { setMessage({ kind: 'error', text: errorText(caught, c.startFailed) }); } finally { setWorking(false); }
  }
  async function apply() {
    if (!run || picked.length === 0) return;
    setWorking(true); setMessage(null);
    try {
      await apiRequest<RunView>(`/projects/${projectId}/runs/${run.id}/tailor/apply`, { method: 'POST', body: JSON.stringify({ proposal_ids: [...picked].sort((a, b) => a - b) }) });
      setPicked([]); setMessage({ kind: 'ok', text: c.started }); onChanged();
    } catch (caught) { setMessage({ kind: 'error', text: errorText(caught, c.failed) }); } finally { setWorking(false); }
  }
  const toggle = (id: number, on: boolean) => setPicked(current => on ? [...new Set([...current, id])] : current.filter(item => item !== id));

  return <Card><CardHeader><CardTitle className="text-lg">{c.title}</CardTitle></CardHeader><CardContent className="grid gap-4">
    <p className="text-sm text-muted-foreground">{c.body}</p>
    <fieldset className="grid gap-2" disabled={busy || working}>
      <legend className="mb-1 text-sm font-medium">{c.mode}</legend>
      {(['autopilot', 'interactive'] as const).map(value => <label key={value} className="flex min-h-11 items-start gap-2 text-sm">
        <input type="radio" name={`tailor-mode-${sessionId}`} className="mt-1 size-4 shrink-0 accent-primary" value={value} checked={mode === value} onChange={() => setMode(value)} />
        <span className="min-w-0"><span className="font-medium">{c[value]}</span><span className="block text-muted-foreground">{c[`${value}Hint` as const]}</span></span></label>)}
    </fieldset>
    <div><Button type="button" className="min-h-11" disabled={busy || working} onClick={() => void start()}>{c.start}</Button></div>
    {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'error' ? 'text-destructive' : ''}`}>{message.text}{message.kind === 'ok' && <> <Link className="text-primary hover:underline" to={`/app/projects/${projectId}/documents`}>{c.docs}</Link></>}</p>}
    {run?.status === 'needs_input' && <p role="status" className="text-sm font-medium">{c.waitingChoice}</p>}
    {payload && <section aria-labelledby={`tailor-result-${run?.id}`} className="grid gap-3 border-t pt-4">
      <h3 id={`tailor-result-${run?.id}`} className="font-semibold">{c.result}</h3>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-muted-foreground">{c.coverage}</dt><dd data-testid="tailor-coverage">{pct(payload.coverage_before, locale)} → {pct(payload.coverage_after, locale)}</dd>
        {payload.mode === 'autopilot' && payload.stop_reason && <><dt className="text-muted-foreground">{c.stop}</dt><dd>{c.stops[payload.stop_reason] ?? payload.stop_reason}</dd></>}
      </dl>
      {payload.mode === 'interactive' && <>
        <h4 className="text-sm font-medium">{c.proposals}</h4>
        {proposals.length === 0 ? <p className="text-sm text-muted-foreground">{c.none}</p> : <ul className="grid gap-3">{proposals.map(item => {
          const ok = selectable(item.status);
          return <li key={item.id} className={`grid gap-1.5 rounded-lg border p-3 text-sm ${ok ? '' : 'bg-muted text-muted-foreground'}`}>
            <label className="flex min-h-11 items-start gap-2">
              <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" disabled={!ok || busy || working} checked={picked.includes(item.id)} onChange={event => toggle(item.id, event.target.checked)} aria-label={`${c.pick} ${item.id + 1}`} />
              <span className="min-w-0 break-words"><span className="text-xs text-muted-foreground">{c.text}</span><span className="block whitespace-pre-wrap">{item.text}</span></span></label>
            <p className="break-words"><span className="text-muted-foreground">{c.find}: </span>{item.find ? <q className="whitespace-pre-wrap">{item.find}</q> : c.append}</p>
            <p className="flex flex-wrap items-center gap-2"><span>{c.evidence}: {item.evidence_ids.length}</span><Badge variant={ok ? 'outline' : item.status === 'applied' ? 'secondary' : 'warning'}>{c[item.status]}</Badge></p>
            {item.status === 'rejected_by_gate' && <p>{c.gateReason}</p>}
          </li>;
        })}</ul>}
        <div><Button type="button" className="min-h-11" disabled={busy || working || picked.length === 0} onClick={() => void apply()}>{c.apply}</Button></div>
      </>}
    </section>}
  </CardContent></Card>;
}
