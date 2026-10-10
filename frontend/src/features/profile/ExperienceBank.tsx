import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '../../lib/api';
import { ApiError, type ExperienceItem, type ExperienceKind, type ExperienceView } from '../../lib/api-types';
import { sendJson, type useResource } from '../projects/useResource';

const KINDS: ExperienceKind[] = ['experience', 'education', 'skill', 'certification', 'project', 'other'];
const copy = {
  th: { title: 'คลังประสบการณ์', hint: 'ข้อเท็จจริงจาก CV ของคุณ AI ใช้ได้เฉพาะข้อมูลในคลังนี้', fromCv: (n: string) => `จาก CV: ${n}`, mine: 'เพิ่มเอง', fact: 'ข้อเท็จจริง', kind: 'ประเภท', role: 'ตำแหน่ง', org: 'องค์กร', period: 'ช่วงเวลา', add: 'เพิ่มข้อเท็จจริง', remove: 'ลบ', edit: 'แก้ไข', save: 'บันทึก', cancel: 'ยกเลิก', extract: 'ดึงจาก CV อีกครั้ง', extractFirst: 'ดึงประสบการณ์จาก CV', loadError: 'โหลดคลังประสบการณ์ไม่สำเร็จ', stop: 'หยุด', retry: 'ลองอีกครั้ง',
    queued: 'รอคิวดึงประสบการณ์จาก CV', running: 'กำลังดึงประสบการณ์จาก CV', failed: 'ดึงประสบการณ์ไม่สำเร็จ', done: (s: { added: number; duplicates: number; rejected: number }) => `เพิ่ม ${s.added}, ซ้ำ ${s.duplicates}, ทิ้ง ${s.rejected} (ไม่พบใน CV)`,
    noProvider: 'ตั้งค่า AI provider เพื่อดึงประสบการณ์จาก CV', settings: 'ไปที่การตั้งค่า', empty: 'ยังไม่มีข้อเท็จจริง เพิ่มเองได้ด้านล่าง', duplicate: 'มีข้อเท็จจริงนี้อยู่แล้ว', full: 'คลังเต็มแล้ว (1,000 รายการ)', failedAction: 'ดำเนินการไม่สำเร็จ ลองอีกครั้ง', other: 'อื่น ๆ',
    kinds: { experience: 'ประสบการณ์', education: 'การศึกษา', skill: 'ทักษะ', certification: 'ใบรับรอง', project: 'โปรเจกต์', other: 'อื่น ๆ' } },
  en: { title: 'Experience bank', hint: 'Facts from your CVs. AI may only use what is in this bank.', fromCv: (n: string) => `From CV: ${n}`, mine: 'Added by you', fact: 'Fact', kind: 'Type', role: 'Role', org: 'Organization', period: 'Period', add: 'Add fact', remove: 'Remove', edit: 'Edit', save: 'Save', cancel: 'Cancel', extract: 'Extract from CV again', extractFirst: 'Extract experience', loadError: 'Could not load the experience bank.', stop: 'Stop', retry: 'Retry',
    queued: 'Waiting to extract experience from your CV', running: 'Extracting experience from your CV', failed: 'Extraction did not finish', done: (s: { added: number; duplicates: number; rejected: number }) => `Added ${s.added}, duplicates ${s.duplicates}, dropped ${s.rejected} (not found in the CV)`,
    noProvider: 'Set up an AI provider to extract experience from your CV', settings: 'Go to Settings', empty: 'No facts yet. You can add one below.', duplicate: 'This fact is already in the bank', full: 'The bank is full (1,000 facts)', failedAction: 'That did not work. Try again.', other: 'Other',
    kinds: { experience: 'Experience', education: 'Education', skill: 'Skill', certification: 'Certification', project: 'Project', other: 'Other' } },
};
type Copy = typeof copy.en;
type Draft = { kind: ExperienceKind; text: string; role: string; organization: string; period: string };
const blank: Draft = { kind: 'experience', text: '', role: '', organization: '', period: '' };
const selectClass = 'flex min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function FactForm({ c, initial, submitLabel, onSubmit, onCancel }: { c: Copy; initial: Draft; submitLabel: string; onSubmit: (d: Draft) => Promise<void>; onCancel?: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof Draft) => (event: { target: { value: string } }) => setDraft(d => ({ ...d, [key]: event.target.value }));
  return <form className="grid gap-3 sm:grid-cols-2" onSubmit={async event => { event.preventDefault(); if (!draft.text.trim() || busy) return; setBusy(true); try { await onSubmit(draft); setDraft(initial); } catch { /* the parent shows the error; keep the draft */ } finally { setBusy(false); } }}>
    <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">{c.fact}<Input value={draft.text} maxLength={1000} onChange={set('text')} /></label>
    <label className="grid gap-1.5 text-sm font-medium">{c.kind}<select className={selectClass} value={draft.kind} onChange={set('kind')}>{KINDS.map(k => <option key={k} value={k}>{c.kinds[k]}</option>)}</select></label>
    <label className="grid gap-1.5 text-sm font-medium">{c.role}<Input value={draft.role} maxLength={200} onChange={set('role')} /></label>
    <label className="grid gap-1.5 text-sm font-medium">{c.org}<Input value={draft.organization} maxLength={200} onChange={set('organization')} /></label>
    <label className="grid gap-1.5 text-sm font-medium">{c.period}<Input value={draft.period} maxLength={60} onChange={set('period')} /></label>
    <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">{onCancel && <Button type="button" variant="outline" onClick={onCancel}>{c.cancel}</Button>}<Button type="submit" disabled={busy || !draft.text.trim()}>{submitLabel}</Button></div>
  </form>;
}

const toBody = (d: Draft) => ({ kind: d.kind, text: d.text.trim(), role: d.role.trim() || null, organization: d.organization.trim() || null, period: d.period.trim() || null });

export function ExperienceBank({ projectId, locale, primaryCvId, bank }: { projectId: string; locale: 'th' | 'en'; primaryCvId: string | null; bank: ReturnType<typeof useResource<ExperienceView>> }) {
  const c = copy[locale];
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = bank.data?.extraction?.status;
  const active = status === 'queued' || status === 'running';
  useEffect(() => { if (!active) return; const timer = window.setInterval(bank.reload, 3000); return () => window.clearInterval(timer); }, [active, bank.reload]);

  async function act(work: () => Promise<unknown>) {
    setError(null);
    try { await work(); bank.reload(); }
    catch (e) { setError(e instanceof ApiError && e.code === 'duplicate' ? c.duplicate : e instanceof ApiError && e.code === 'bank_full' ? c.full : c.failedAction); throw e; }
  }
  const base = `/projects/${projectId}/experience`;
  const extraction = bank.data?.extraction;
  const cvForRun = extraction?.cv_id ?? primaryCvId;
  const groups = new Map<string, ExperienceItem[]>();
  for (const item of bank.data?.items ?? []) {
    const key = [item.role, item.organization, item.period].filter(Boolean).join(' · ') || c.other;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return <section aria-labelledby="experience-bank-title" className="grid gap-4">
    <div><h2 id="experience-bank-title" className="text-lg font-semibold">{c.title}</h2><p className="text-sm text-muted-foreground">{c.hint}</p></div>
    <div role="status" aria-live="polite" className="text-sm">
      {bank.data && !bank.data.provider_configured && <p className="flex flex-wrap items-center gap-2">{c.noProvider} <Link className="underline" to="/app/settings">{c.settings}</Link></p>}
      {extraction && active && <p className="flex flex-wrap items-center gap-2">{status === 'queued' ? c.queued : c.running}<Button size="sm" variant="outline" onClick={() => void act(() => apiRequest(`/projects/${projectId}/runs/${extraction.run_id}/cancel`, { method: 'POST' })).catch(() => undefined)}>{c.stop}</Button></p>}
      {extraction?.status === 'completed' && extraction.summary && <p>{c.done(extraction.summary)}</p>}
      {extraction && ['failed', 'interrupted', 'cancelled'].includes(extraction.status) && <p className="flex flex-wrap items-center gap-2">{c.failed}{cvForRun && <Button size="sm" variant="outline" onClick={() => void act(() => apiRequest(`/projects/${projectId}/cvs/${cvForRun}/experience-runs`, { method: 'POST' })).catch(() => undefined)}>{c.retry}</Button>}</p>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {bank.status === 'error' && <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{c.loadError}<Button variant="outline" onClick={bank.reload}>{c.retry}</Button></p>}
    {bank.data && bank.data.items.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{c.empty}</p>}
    {[...groups].map(([title, items]) => <div key={title} className="grid gap-2">
      <h3 className="break-words font-medium [overflow-wrap:anywhere]">{title}</h3>
      <ul className="grid gap-2">{items.map(item => <li key={item.id} className="rounded-lg border p-3">
        {editing === item.id
          ? <FactForm c={c} submitLabel={c.save} onCancel={() => setEditing(null)} initial={{ kind: item.kind, text: item.text, role: item.role ?? '', organization: item.organization ?? '', period: item.period ?? '' }}
              onSubmit={d => act(() => sendJson(`${base}/${item.id}`, 'PUT', toBody(d))).then(() => setEditing(null))} />
          : <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><p className="break-words [overflow-wrap:anywhere]">{item.text}</p><p className="text-xs text-muted-foreground">{c.kinds[item.kind]} · {item.source_cv_name ? c.fromCv(item.source_cv_name) : c.mine}</p></div>
              <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(item.id)} aria-label={`${c.edit}: ${item.text}`}>{c.edit}</Button>
                <Button size="sm" variant="ghost" className="text-destructive" aria-label={`${c.remove}: ${item.text}`} onClick={() => void act(() => apiRequest(`${base}/${item.id}`, { method: 'DELETE' })).catch(() => undefined)}>{c.remove}</Button></div>
            </div>}
      </li>)}</ul>
    </div>)}
    <FactForm c={c} initial={blank} submitLabel={c.add} onSubmit={d => act(() => sendJson(base, 'POST', toBody(d)))} />
    {cvForRun && bank.data?.provider_configured && !active && <div><Button variant="outline" onClick={() => void act(() => apiRequest(`/projects/${projectId}/cvs/${cvForRun}/experience-runs`, { method: 'POST' })).catch(() => undefined)}>{extraction ? c.extract : c.extractFirst}</Button></div>}
  </section>;
}
