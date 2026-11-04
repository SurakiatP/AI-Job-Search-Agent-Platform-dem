import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Link } from 'react-router';
import { AiLabel, AiMark } from '@/components/AiMark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { accountErrorText, useGatewayHelp, useRunGate } from '../../lib/accountGate';
import { GateNote } from '@/components/GateNote';
import { apiRequest } from '../../lib/api';
import { ApiError, type Locale, type RunView, type TailorMode, type TailorPayload } from '../../lib/api-types';

const copy = {
  th: { wishLabel: 'อยากให้ปรับอะไร และปรับมากแค่ไหน', wishHint: 'เช่น "เน้นทักษะ Python ปรับไม่เกิน 3 จุด" ปล่อยว่างได้ ระบบจะไม่เพิ่มทักษะหรือข้อมูลที่ไม่มีในข้อเท็จจริงของคุณ และไม่เดา', title: 'ปรับ CV ให้เข้ากับงาน', outcomeNone: 'ยังปรับ CV ให้ไม่ได้', outcomeNoneBody: (n: number) => `AI เสนอแก้ ${n} จุด แต่ไม่มีจุดไหนมีหลักฐานรองรับในข้อเท็จจริงของคุณ ระบบจึงไม่เขียนให้ เพราะไม่แต่งทักษะหรือตัวเลขที่คุณไม่มี`, outcomeSome: (a: number, r: number) => `แก้ให้ ${a} จุด${r ? ` ไม่ผ่านหลักฐาน ${r} จุด` : ''}`, missingTitle: 'ทักษะที่งานต้องการ แต่ CV ยังไม่มี', missingHelp: 'ถ้าคุณมีประสบการณ์เหล่านี้จริง ให้เพิ่มใน “ข้อเท็จจริงของฉัน” แล้วปรับอีกครั้ง คะแนนจึงจะขยับ', addFacts: 'เพิ่มข้อเท็จจริงของฉัน', waitingChoice: 'รอให้คุณเลือก', tailor_already_applied: 'ใช้ข้อเสนอของงานนี้ไปแล้ว ถ้าต้องการแก้อีกให้เริ่มปรับ CV ใหม่', body: 'เอเจนต์แก้ CV โดยอ้างอิงเฉพาะข้อเท็จจริงของฉัน CV ต้นฉบับไม่ถูกแก้', mode: 'โหมด', autopilot: 'อัตโนมัติ', autopilotHint: 'เอเจนต์นำคำแนะนำไปปรับ CV ให้เลย แล้วบันทึกเป็นเวอร์ชันใหม่ทันที ใช้เฉพาะทักษะและประสบการณ์ที่คุณมีจริง', interactive: 'เลือกเอง', interactiveHint: 'คุณบอกเองว่าอยากปรับอะไรและมากแค่ไหน แล้วเลือกข้อเสนอที่ต้องการก่อนบันทึก', start: 'ปรับ CV', result: 'ผลการปรับ CV', stop: 'เหตุผลที่หยุด', coverage: 'ความครอบคลุมทักษะ', proposals: 'ข้อเสนอแก้ไข', text: 'ข้อความใหม่', find: 'แทนที่', append: 'เพิ่มต่อท้าย CV', evidence: 'หลักฐานที่อ้างอิง', status: 'สถานะ', proposed: 'รอเลือก', applied: 'ใช้แล้ว', rejected_by_gate: 'ไม่ผ่านการตรวจหลักฐาน', gateReason: 'ถูกปิดเพราะอ้างหลักฐานไม่ครบหรือไม่ตรงกับข้อเท็จจริงของฉัน', pick: 'เลือกข้อเสนอ', apply: 'ใช้ข้อเสนอที่เลือก', none: 'ไม่มีข้อเสนอ', docs: 'ดูเอกสาร', started: 'ใช้ข้อเสนอแล้ว กำลังสร้างเวอร์ชันใหม่', failed: 'ใช้ข้อเสนอไม่สำเร็จ ลองอีกครั้ง', evidence_required: 'หลักฐานของข้อเสนอที่เลือกไม่ผ่านการตรวจ', tailor_nothing_to_apply: 'ข้อเสนอที่เลือกใช้กับ CV ปัจจุบันไม่ได้', document_busy: 'มีงานของเอกสารนี้กำลังทำอยู่ ลองใหม่ภายหลัง', startFailed: 'เริ่มปรับ CV ไม่สำเร็จ ลองอีกครั้ง', provider: 'ยังไม่ได้ตั้งค่าเกตเวย์ AI เปิดการตั้งค่าเกตเวย์ AI เพื่อตรวจสอบการเชื่อมต่อ', stops: { full_coverage: 'ครอบคลุมทักษะที่งานต้องการครบแล้ว', no_gain: 'ไม่มีความคืบหน้าต่อเนื่อง 2 รอบ', max_rounds: 'ครบ 30 รอบ', time_budget: 'หมดเวลาที่กำหนด', interactive: 'ข้อเสนอรอบเดียว' } as Record<string, string> },
  en: { wishLabel: 'What should change, and by how much?', wishHint: 'For example: "Focus on Python, at most 3 changes". Optional. Nothing outside your facts is added, and nothing is guessed.', title: 'Tailor CV', outcomeNone: 'Could not tailor the CV yet', outcomeNoneBody: (n: number) => `The AI suggested ${n} change${n === 1 ? '' : 's'}, but none is backed by your facts, so none was written. Skills and numbers you have no evidence for are never added.`, outcomeSome: (a: number, r: number) => `${a} change${a === 1 ? '' : 's'} made${r ? `, ${r} failed the evidence check` : ''}`, missingTitle: 'Skills the job asks for that your CV lacks', missingHelp: 'If you really have these, add them to My facts and tailor again. Then the score can move.', addFacts: 'Add to My facts', waitingChoice: 'Waiting for your choice', tailor_already_applied: 'These proposals were already applied. Start a new tailoring run to change the CV again.', body: 'The agent edits your CV using only facts from your facts. Your original CV is never changed.', mode: 'Mode', autopilot: 'Autopilot', autopilotHint: 'The agent applies the advice to your CV for you and saves a new version right away, using only skills and experience you really have', interactive: 'Interactive', interactiveHint: 'You say what to change and by how much, then pick the proposals you want before anything is saved', start: 'Tailor CV', result: 'Tailoring result', stop: 'Stopped because', coverage: 'Skill coverage', proposals: 'Proposed edits', text: 'New text', find: 'Replaces', append: 'Adds to the end of the CV', evidence: 'Cited facts', status: 'Status', proposed: 'Proposed', applied: 'Applied', rejected_by_gate: 'Rejected by evidence check', gateReason: 'Disabled: its cited facts are missing or do not support the text.', pick: 'Select proposal', apply: 'Apply selected', none: 'No proposals', docs: 'Open documents', started: 'Applied. Creating the new version.', failed: 'Could not apply. Try again.', evidence_required: 'The evidence check failed for the selected proposals.', tailor_nothing_to_apply: 'The selected proposals do not fit the current CV.', document_busy: 'A task for this document is running. Try again later.', startFailed: 'Could not start tailoring. Try again.', provider: 'AI is unavailable because the gateway is not configured. Open AI gateway settings to check the connection.', stops: { full_coverage: 'Every required skill is covered', no_gain: 'No gain for 2 rounds in a row', max_rounds: 'Reached 30 rounds', time_budget: 'Time budget used', interactive: 'One round of proposals' } as Record<string, string> },
};
const pct = (value: number | null | undefined, locale: Locale) => value == null ? '—' : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
const isTailor = (payload: RunView['result_payload']): payload is TailorPayload => payload?.kind === 'tailor';

export function TailorCard({ projectId, sessionId, locale, outputLanguage, busy, run, onChanged }: { projectId: string; sessionId: string; locale: Locale; outputLanguage: Locale; busy: boolean; run: RunView | null; onChanged: () => void }) {
  const c = copy[locale];
  const [mode, setMode] = useState<TailorMode>('autopilot');
  const { t } = useTranslation();
  const gate = useRunGate();
  const [picked, setPicked] = useState<number[]>([]);
  const [wish, setWish] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [working, setWorking] = useState(false);
  const payload = (run?.status === 'completed' || run?.status === 'needs_input') && isTailor(run.result_payload) ? run.result_payload : null;
  const proposals = payload?.mode === 'interactive' ? payload.proposals ?? [] : [];
  const selectable = (status: string) => status === 'proposed';
  const gatewayHelp = useGatewayHelp(locale);
  const errorText = (caught: unknown, fallback: string) => accountErrorText(t, caught, locale) ?? (caught instanceof ApiError ? (caught.code === 'gateway_unconfigured' ? (gatewayHelp.isAdmin ? c.provider : gatewayHelp.contactText) : (c as unknown as Record<string, string>)[caught.code] ?? fallback) : fallback);

  async function start() {
    setWorking(true); setMessage(null);
    const key = crypto.randomUUID();
    try {
      await apiRequest<RunView>(`/async/projects/${projectId}/agent-runs`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ session_id: sessionId, operation: 'tailor_cv', tailor_mode: mode, output_language: outputLanguage, idempotency_key: key, ...(mode === 'interactive' && wish.trim() ? { owner_instructions: wish.trim() } : {}) }) });
      setPicked([]); onChanged();
    } catch (caught) { setMessage({ kind: 'error', text: errorText(caught, c.startFailed) }); } finally { setWorking(false); }
  }
  async function apply() {
    if (!run || picked.length === 0) return;
    setWorking(true); setMessage(null);
    try {
      await apiRequest<RunView>(`/async/projects/${projectId}/agent-runs/${run.id}/cv-tailoring/apply`, { method: 'POST', body: JSON.stringify({ proposal_ids: [...picked].sort((a, b) => a - b) }) });
      setPicked([]); setMessage({ kind: 'ok', text: c.started }); onChanged();
    } catch (caught) { setMessage({ kind: 'error', text: errorText(caught, c.failed) }); } finally { setWorking(false); }
  }
  const toggle = (id: number, on: boolean) => setPicked(current => on ? [...new Set([...current, id])] : current.filter(item => item !== id));

  return <section aria-labelledby={`tailor-${sessionId}`} className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
    <h2 id={`tailor-${sessionId}`} className="flex items-center gap-2 text-lg font-semibold"><AiMark />{c.title}</h2>
    <p className="text-sm text-muted-foreground">{c.body}</p>
    <fieldset className="grid gap-2" disabled={busy || working}>
      <legend className="mb-1 text-sm font-medium">{c.mode}</legend>
      {(['autopilot', 'interactive'] as const).map(value => <label key={value} className="flex min-h-11 items-start gap-2 text-sm">
        <input type="radio" name={`tailor-mode-${sessionId}`} className="mt-1 size-5 shrink-0 accent-primary" value={value} checked={mode === value} onChange={() => setMode(value)} />
        <span className="min-w-0"><span className="font-medium">{c[value]}</span><span className="block text-muted-foreground">{c[`${value}Hint` as const]}</span></span></label>)}
    </fieldset>
    {mode === 'interactive' && <div className="grid gap-2">
      <label htmlFor={`tailor-wish-${sessionId}`} className="text-sm font-medium">{c.wishLabel}</label>
      <Textarea id={`tailor-wish-${sessionId}`} value={wish} maxLength={1000} rows={3} disabled={busy || working} onChange={event => setWish(event.target.value)} aria-describedby={`tailor-wish-hint-${sessionId}`} />
      <p id={`tailor-wish-hint-${sessionId}`} className="text-xs text-muted-foreground">{c.wishHint}</p>
    </div>}
    <div className="grid gap-2"><div><Button type="button" variant="outline" busy={working} disabled={busy || working || gate.blocked} title={gate.title} onClick={() => void start()}>{c.start}</Button></div><GateNote /></div>
    {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'error' ? 'text-destructive' : ''}`}>{message.text}{message.kind === 'ok' && <> <Link className="text-primary hover:underline" to={`/app/projects/${projectId}/documents`}>{c.docs}</Link></>}</p>}
    {run?.status === 'needs_input' && <p role="status" className="text-sm font-medium">{c.waitingChoice}</p>}
    {payload && <section aria-labelledby={`tailor-result-${run?.id}`} className="grid gap-3 border-t pt-4">
      <h3 id={`tailor-result-${run?.id}`} className="flex flex-wrap items-center gap-2 font-semibold">{c.result}<AiLabel check /></h3>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-muted-foreground">{c.coverage}</dt><dd data-testid="tailor-coverage">{pct(payload.coverage_before, locale)} → {pct(payload.coverage_after, locale)}</dd>
        {payload.mode === 'autopilot' && payload.stop_reason && <><dt className="text-muted-foreground">{c.stop}</dt><dd>{c.stops[payload.stop_reason] ?? payload.stop_reason}</dd></>}
      </dl>
      {payload.mode === 'autopilot' && (() => {
        const all = payload.proposals ?? [];
        const applied = all.filter(item => item.status === 'applied').length;
        const rejected = all.filter(item => item.status === 'rejected_by_gate').length;
        return applied === 0 && rejected > 0
          ? <div role="status" className="grid gap-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"><p className="font-medium">{c.outcomeNone}</p><p>{c.outcomeNoneBody(rejected)}</p></div>
          : <p className="text-sm">{c.outcomeSome(applied, rejected)}</p>;
      })()}
      {(payload.missing_skills?.length ?? 0) > 0 && <div className="grid gap-2 text-sm">
        <p className="font-medium">{c.missingTitle}</p>
        <ul className="flex flex-wrap gap-2">{payload.missing_skills!.map(skill => <li key={skill}><Badge variant="outline">{skill}</Badge></li>)}</ul>
        <p className="text-muted-foreground">{c.missingHelp}</p>
        <Link className="w-fit text-primary hover:underline" to={`/app/projects/${projectId}/profile`}>{c.addFacts}</Link>
      </div>}
      {payload.mode === 'interactive' && <>
        <h4 className="text-sm font-medium">{c.proposals}</h4>
        {proposals.length === 0 ? <p className="text-sm text-muted-foreground">{c.none}</p> : <ul className="grid gap-3">{proposals.map(item => {
          const ok = selectable(item.status);
          return <li key={item.id} className={`grid gap-2 rounded-lg border p-3 text-sm ${ok ? '' : 'bg-muted text-muted-foreground'}`}>
            <label className="flex min-h-11 items-start gap-2">
              <input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" disabled={!ok || busy || working} checked={picked.includes(item.id)} onChange={event => toggle(item.id, event.target.checked)} aria-label={`${c.pick} ${item.id + 1}`} />
              <span className="min-w-0 break-words"><span className="text-xs text-muted-foreground">{c.text}</span><span className="block whitespace-pre-wrap">{item.text}</span></span></label>
            <p className="break-words"><span className="text-muted-foreground">{c.find}: </span>{item.find ? <q className="whitespace-pre-wrap">{item.find}</q> : c.append}</p>
            <p className="flex flex-wrap items-center gap-2"><span>{c.evidence}: {item.evidence_ids.length}</span><Badge variant={ok ? 'outline' : item.status === 'applied' ? 'secondary' : 'warning'}>{c[item.status]}</Badge></p>
            {item.status === 'rejected_by_gate' && <p>{c.gateReason}</p>}
          </li>;
        })}</ul>}
        <div><Button type="button" busy={busy} disabled={busy || working || picked.length === 0} onClick={() => void apply()}>{c.apply}</Button></div>
      </>}
    </section>}
  </section>;
}
