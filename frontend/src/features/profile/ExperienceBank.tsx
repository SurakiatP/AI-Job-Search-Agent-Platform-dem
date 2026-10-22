import { Sparkles } from 'lucide-react';
import { BusyNote } from '@/components/BusyNote';
import { useGatewayHelp, useRunGate } from '../../lib/accountGate';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '../../lib/api';
import { ApiError, type EmploymentType, type ExperienceItem, type ExperienceKind, type ExperienceView, type SkillGroup } from '../../lib/api-types';
import { sendJson, type useResource } from '../projects/useResource';
import { AiLabel } from '@/components/AiMark';

const KINDS: ExperienceKind[] = ['experience', 'education', 'skill', 'certification', 'project', 'other'];
const SKILL_GROUPS: SkillGroup[] = ['technical', 'tools', 'soft', 'language', 'domain'];
const EMPLOYMENT: EmploymentType[] = ['full_time', 'part_time', 'contract', 'internship', 'freelance'];
const copy = {
  th: { title: 'คลังประสบการณ์', hint: 'ข้อเท็จจริงจาก CV ของคุณ AI ใช้ได้เฉพาะข้อมูลในคลังนี้', fromCv: (n: string) => `จาก CV: ${n}`, mine: 'เพิ่มเอง', fact: 'ข้อเท็จจริง', kind: 'ประเภท', role: 'ตำแหน่ง', org: 'องค์กร', period: 'ช่วงเวลา', add: 'เพิ่มข้อเท็จจริง', remove: 'ลบ', edit: 'แก้ไข', save: 'บันทึก', cancel: 'ยกเลิก', extract: 'สกัดประสบการณ์จาก CV ด้วย AI อีกครั้ง', extractFirst: 'สกัดประสบการณ์จาก CV ด้วย AI', loadError: 'โหลดคลังประสบการณ์ไม่สำเร็จ', stop: 'หยุด', retry: 'ลองอีกครั้ง',
    queued: 'เอเจนต์รอคิวสกัดประสบการณ์จาก CV', running: 'เอเจนต์กำลังประมวลผล: สกัดประสบการณ์จาก CV', failed: 'สกัดประสบการณ์ไม่สำเร็จ', done: (s: { added: number; duplicates: number; rejected: number }) => `เพิ่ม ${s.added}, ซ้ำ ${s.duplicates}, ทิ้ง ${s.rejected} (ไม่พบใน CV)`,
    noProvider: 'ยังไม่ได้ตั้งค่า AI gateway ใส่ OPENROUTER_API_KEY แล้วดูที่ ตั้งค่า > เกตเวย์ AI', settings: 'ไปที่การตั้งค่า', empty: 'ยังไม่มีข้อเท็จจริง เพิ่มเองได้ด้านล่าง', duplicate: 'มีข้อเท็จจริงนี้อยู่แล้ว', full: 'คลังเต็มแล้ว (1,000 รายการ)', failedAction: 'ดำเนินการไม่สำเร็จ ลองอีกครั้ง', other: 'อื่น ๆ', more: 'รายละเอียดเพิ่มเติม', optional: ' (ไม่บังคับ)', employment: 'การจ้างงาน', location: 'สถานที่', start: 'เริ่ม', end: 'สิ้นสุด', current: 'ยังทำอยู่ที่นี่', present: 'ปัจจุบัน', industry: 'อุตสาหกรรม', duties: 'หน้าที่รับผิดชอบ', wins: 'ผลงานที่วัดได้', skills: 'ทักษะที่ใช้', years: (y: number) => `ประสบการณ์ทำงานรวม ${y} ปี`, none: 'ไม่ระบุตำแหน่ง', count: (n: number) => `${n} รายการ`, notSet: 'ไม่ระบุ',
    types: { full_time: 'เต็มเวลา', part_time: 'พาร์ตไทม์', contract: 'สัญญาจ้าง', internship: 'ฝึกงาน', freelance: 'ฟรีแลนซ์' } as Record<EmploymentType, string>,
    skillGroup: 'กลุ่มทักษะ', degree: 'วุฒิ / สาขา', institution: 'สถาบัน', ungrouped: 'ยังไม่จัดกลุ่ม', skillGroups: { technical: 'ทักษะทางเทคนิค', tools: 'เครื่องมือและเทคโนโลยี', soft: 'ซอฟต์สกิล', language: 'ภาษา', domain: 'ความรู้เฉพาะสายงาน' } as Record<SkillGroup, string>, kinds: { experience: 'ประสบการณ์ทำงาน', education: 'การศึกษา', skill: 'ทักษะ', certification: 'ใบรับรอง', project: 'โปรเจกต์', other: 'อื่น ๆ' } },
  en: { title: 'Experience bank', hint: 'Facts from your CVs. AI may only use what is in this bank.', fromCv: (n: string) => `From CV: ${n}`, mine: 'Added by you', fact: 'Fact', kind: 'Type', role: 'Role', org: 'Organization', period: 'Period', add: 'Add fact', remove: 'Remove', edit: 'Edit', save: 'Save', cancel: 'Cancel', extract: 'Extract experience from CV with AI again', extractFirst: 'Extract experience from CV with AI', loadError: 'Could not load the experience bank.', stop: 'Stop', retry: 'Retry',
    queued: 'The agent is queued to extract experience from your CV', running: 'The agent is processing: extracting experience from your CV', failed: 'Extraction did not finish', done: (s: { added: number; duplicates: number; rejected: number }) => `Added ${s.added}, duplicates ${s.duplicates}, dropped ${s.rejected} (not found in the CV)`,
    noProvider: 'The AI gateway is not configured. Set OPENROUTER_API_KEY, then see Settings > AI gateway.', settings: 'Go to Settings', empty: 'No facts yet. You can add one below.', duplicate: 'This fact is already in the bank', full: 'The bank is full (1,000 facts)', failedAction: 'That did not work. Try again.', other: 'Other', more: 'More details', optional: ' (optional)', employment: 'Employment', location: 'Location', start: 'Start', end: 'End', current: 'I still work here', present: 'Present', industry: 'Industry', duties: 'Responsibilities', wins: 'Measurable achievements', skills: 'Skills used', years: (y: number) => `${y} years of work experience in total`, none: 'No role stated', count: (n: number) => `${n} ${n === 1 ? 'fact' : 'facts'}`, notSet: 'Not set',
    types: { full_time: 'Full time', part_time: 'Part time', contract: 'Contract', internship: 'Internship', freelance: 'Freelance' } as Record<EmploymentType, string>,
    skillGroup: 'Skill group', degree: 'Degree / major', institution: 'Institution', ungrouped: 'Ungrouped', skillGroups: { technical: 'Technical skills', tools: 'Tools & technology', soft: 'Soft skills', language: 'Languages', domain: 'Domain knowledge' } as Record<SkillGroup, string>, kinds: { experience: 'Work experience', education: 'Education', skill: 'Skill', certification: 'Certification', project: 'Project', other: 'Other' } },
};
type Copy = typeof copy.en;
type Draft = { kind: ExperienceKind; skill_group: SkillGroup | ''; text: string; role: string; organization: string; period: string; employment_type: EmploymentType | ''; location: string; start_date: string; end_date: string; is_current: boolean; industry: string; responsibilities: string; achievements: string; skills_used: string };
const blank: Draft = { kind: 'experience', skill_group: '', text: '', role: '', organization: '', period: '', employment_type: '', location: '', start_date: '', end_date: '', is_current: false, industry: '', responsibilities: '', achievements: '', skills_used: '' };
const fieldClass = 'flex min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const fromItem = (i: ExperienceItem): Draft => ({ kind: i.kind, skill_group: i.skill_group ?? '', text: i.text, role: i.role ?? '', organization: i.organization ?? '', period: i.period ?? '', employment_type: i.employment_type ?? '', location: i.location ?? '', start_date: i.start_date ?? '', end_date: i.end_date ?? '', is_current: i.is_current, industry: i.industry ?? '', responsibilities: i.responsibilities ?? '', achievements: i.achievements ?? '', skills_used: i.skills_used ?? '' });
const hasExtra = (d: Draft) => Boolean(d.employment_type || d.location || d.start_date || d.end_date || d.is_current || d.industry || d.responsibilities || d.achievements || d.skills_used);

function FactForm({ c, initial, submitLabel, onSubmit, onCancel }: { c: Copy; initial: Draft; submitLabel: string; onSubmit: (d: Draft) => Promise<void>; onCancel?: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof Draft) => (event: { target: { value: string } }) => setDraft(d => ({ ...d, [key]: event.target.value }));
  const text = (key: keyof Draft, label: string, max: number, type = 'text') => <label className="grid gap-1.5 text-sm font-medium"><span>{label}<span className="font-normal text-muted-foreground">{c.optional}</span></span><Input type={type} value={draft[key] as string} maxLength={max} onChange={set(key)} /></label>;
  const area = (key: keyof Draft, label: string, max: number) => <label className="grid gap-1.5 text-sm font-medium sm:col-span-2"><span>{label}<span className="font-normal text-muted-foreground">{c.optional}</span></span><textarea className={fieldClass} rows={3} value={draft[key] as string} maxLength={max} onChange={set(key)} /></label>;
  return <form className="grid gap-3 sm:grid-cols-2" onSubmit={async event => { event.preventDefault(); if (!draft.text.trim() || busy) return; setBusy(true); try { await onSubmit(draft); setDraft(initial); } catch { /* the parent shows the error; keep the draft */ } finally { setBusy(false); } }}>
    <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">{c.fact}<Input value={draft.text} maxLength={1000} onChange={set('text')} /></label>
    <label className="grid gap-1.5 text-sm font-medium"><span>{c.kind}<span className="font-normal text-muted-foreground">{c.optional}</span></span><select className={fieldClass} value={draft.kind} onChange={set('kind')}>{KINDS.map(k => <option key={k} value={k}>{c.kinds[k]}</option>)}</select></label>
    {draft.kind === 'skill' && <label className="grid gap-1.5 text-sm font-medium"><span>{c.skillGroup}<span className="font-normal text-muted-foreground">{c.optional}</span></span><select className={fieldClass} value={draft.skill_group} onChange={set('skill_group')}><option value="">{c.notSet}</option>{SKILL_GROUPS.map(g => <option key={g} value={g}>{c.skillGroups[g]}</option>)}</select></label>}
    {text('role', draft.kind === 'education' ? c.degree : c.role, 200)}
    {text('organization', draft.kind === 'education' ? c.institution : c.org, 200)}
    {text('period', c.period, 60)}
    <details className="rounded-lg border bg-muted/30 p-3 sm:col-span-2" open={hasExtra(initial)}>
      <summary className="cursor-pointer text-sm font-medium">{c.more}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium"><span>{c.employment}<span className="font-normal text-muted-foreground">{c.optional}</span></span><select className={fieldClass} value={draft.employment_type} onChange={set('employment_type')}><option value="">{c.notSet}</option>{EMPLOYMENT.map(t => <option key={t} value={t}>{c.types[t]}</option>)}</select></label>
        {text('location', c.location, 200)}
        {text('industry', c.industry, 200)}
        {text('start_date', c.start, 7, 'month')}
        <label className="grid gap-1.5 text-sm font-medium"><span>{c.end}<span className="font-normal text-muted-foreground">{c.optional}</span></span><Input type="month" value={draft.is_current ? '' : draft.end_date} disabled={draft.is_current} onChange={set('end_date')} /></label>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={draft.is_current} onChange={event => setDraft(d => ({ ...d, is_current: event.target.checked, end_date: event.target.checked ? '' : d.end_date }))} />{c.current}</label>
        {area('responsibilities', c.duties, 2000)}
        {area('achievements', c.wins, 2000)}
        <label className="grid gap-1.5 text-sm font-medium sm:col-span-2"><span>{c.skills}<span className="font-normal text-muted-foreground">{c.optional}</span></span><Input value={draft.skills_used} maxLength={500} onChange={set('skills_used')} /></label>
      </div>
    </details>
    <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">{onCancel && <Button type="button" variant="outline" onClick={onCancel}>{c.cancel}</Button>}<Button type="submit" busy={busy} disabled={busy || !draft.text.trim()}>{submitLabel}</Button></div>
  </form>;
}

const toBody = (d: Draft) => {
  const t = (v: string) => v.trim() || null;
  return { kind: d.kind, skill_group: d.kind === 'skill' ? d.skill_group || null : null, text: d.text.trim(), role: t(d.role), organization: t(d.organization), period: t(d.period), employment_type: d.employment_type || null, location: t(d.location), start_date: d.start_date || null, end_date: d.is_current ? null : d.end_date || null, is_current: d.is_current, industry: t(d.industry), responsibilities: t(d.responsibilities), achievements: t(d.achievements), skills_used: t(d.skills_used) };
};
const month = (v: string, locale: 'th' | 'en') => new Date(v + '-01T00:00:00').toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { month: 'short', year: 'numeric' });
const when = (i: ExperienceItem, c: Copy, locale: 'th' | 'en') => i.start_date || i.is_current ? [i.start_date ? month(i.start_date, locale) : '', i.is_current ? c.present : i.end_date ? month(i.end_date, locale) : ''].filter(Boolean).join(' – ') : i.period;

export function ExperienceBank({ projectId, locale, primaryCvId, bank }: { projectId: string; locale: 'th' | 'en'; primaryCvId: string | null; bank: ReturnType<typeof useResource<ExperienceView>> }) {
  const c = copy[locale];
  const gatewayHelp = useGatewayHelp(locale);
  const gate = useRunGate();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = bank.data?.extraction?.status;
  const active = status === 'queued' || status === 'running';
  // The page polls while an extraction is queued or running.

  async function act(work: () => Promise<unknown>) {
    setError(null);
    try { await work(); bank.reload(); }
    catch (e) { setError(e instanceof ApiError && e.code === 'duplicate' ? c.duplicate : e instanceof ApiError && e.code === 'bank_full' ? c.full : c.failedAction); throw e; }
  }
  const base = `/projects/${projectId}/experience`;
  const extraction = bank.data?.extraction;
  const cvForRun = extraction?.cv_id ?? primaryCvId;
  const byKind = KINDS.map(kind => ({ kind, items: (bank.data?.items ?? []).filter(item => item.kind === kind) })).filter(g => g.items.length);
  // Work experience is split by employer and role; other categories stay flat.
  const sections = (kind: ExperienceKind, items: ExperienceItem[]) => {
    if (kind === 'skill') return [...SKILL_GROUPS, null].map(g => ({ title: g ? c.skillGroups[g] : c.ungrouped, items: items.filter(i => (i.skill_group ?? null) === g), counted: true })).filter(g => g.items.length);
    if (kind !== 'experience') return [{ title: '', items, counted: false }];
    const groups = new Map<string, ExperienceItem[]>();
    for (const item of items) { const key = [item.role, item.organization].filter(Boolean).join(' · ') || c.none; groups.set(key, [...(groups.get(key) ?? []), item]); }
    return [...groups].map(([title, rows]) => ({ title, items: rows, counted: false }));
  };

  return <section aria-labelledby="experience-bank-title" className="grid gap-4">
    <div><h2 id="experience-bank-title" className="text-lg font-semibold">{c.title}</h2><p className="text-sm text-muted-foreground">{c.hint}</p></div>
    <div role="status" aria-live="polite" className="text-sm">
      {bank.data && !bank.data.provider_configured && <p className="flex flex-wrap items-center gap-2">{gatewayHelp.isAdmin ? c.noProvider : gatewayHelp.contactText} {gatewayHelp.isAdmin && <Link className="underline" to="/app/settings?section=gateway">{c.settings}</Link>}</p>}
      {extraction && active && <BusyNote announce={false} bar label={status === 'queued' ? c.queued : c.running} action={<Button size="sm" variant="outline" onClick={() => void act(() => apiRequest(`/async/projects/${projectId}/agent-runs/${extraction.run_id}/cancel`, { method: 'POST' })).catch(() => undefined)}>{c.stop}</Button>} />}
      {extraction?.status === 'completed' && extraction.summary && <p>{c.done(extraction.summary)}</p>}
      {extraction && ['failed', 'interrupted', 'cancelled'].includes(extraction.status) && <p className="flex flex-wrap items-center gap-2">{c.failed}{cvForRun && <Button size="sm" variant="outline" disabled={gate.blocked} title={gate.title} onClick={() => void act(() => apiRequest(`/async/projects/${projectId}/cvs/${cvForRun}/experience-extractions`, { method: 'POST' })).catch(() => undefined)}>{c.retry}</Button>}</p>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {bank.status === 'error' && <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{c.loadError}<Button variant="outline" onClick={bank.reload}>{c.retry}</Button></p>}
    {bank.data && bank.data.items.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{c.empty}</p>}
    {bank.data && bank.data.years_of_experience > 0 && <p className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{c.years(bank.data.years_of_experience)}</p>}
    {byKind.map(({ kind, items }) => <div key={kind} className="grid gap-3">
      <h3 className="flex items-baseline gap-2 border-b pb-1.5 text-base font-semibold">{c.kinds[kind]}<span className="text-sm font-normal text-muted-foreground">{c.count(items.length)}</span></h3>
      {sections(kind, items).map(group => <div key={group.title} className="grid gap-2">
        {group.title && <h4 className="flex items-baseline gap-2 break-words text-sm font-medium [overflow-wrap:anywhere]">{group.title}{group.counted && <span className="text-xs font-normal text-muted-foreground">{c.count(group.items.length)}</span>}</h4>}
        <ul className={kind === 'skill' ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-2'}>{group.items.map(item => <li key={item.id} className="rounded-lg border bg-card p-3">
          {editing === item.id
            ? <FactForm c={c} submitLabel={c.save} onCancel={() => setEditing(null)} initial={fromItem(item)}
                onSubmit={d => act(() => sendJson(base + '/' + item.id, 'PUT', toBody(d))).then(() => setEditing(null))} />
            : <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid min-w-0 gap-1">
                  <p className="break-words [overflow-wrap:anywhere]">{item.text}</p>
                  {item.kind === 'education' && item.role && <p className="text-sm"><span className="font-medium">{c.degree}: </span>{item.role}</p>}
                  {item.kind === 'education' && item.organization && <p className="text-sm"><span className="font-medium">{c.institution}: </span>{item.organization}</p>}
                  <p className="text-xs text-muted-foreground">{[when(item, c, locale), item.employment_type && c.types[item.employment_type], item.location, item.industry].filter(Boolean).join(' · ')}</p>
                  {item.responsibilities && <p className="text-sm"><span className="font-medium">{c.duties}: </span>{item.responsibilities}</p>}
                  {item.achievements && <p className="text-sm"><span className="font-medium">{c.wins}: </span>{item.achievements}</p>}
                  {item.skills_used && <p className="text-sm"><span className="font-medium">{c.skills}: </span>{item.skills_used}</p>}
                  <p className="text-xs text-muted-foreground">{item.source_cv_name ? c.fromCv(item.source_cv_name) : c.mine}</p>
                  {item.source === 'cv' && <AiLabel kind="extracted" className="mt-1.5" />}
                </div>
                <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(item.id)} aria-label={c.edit + ': ' + item.text}>{c.edit}</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" aria-label={c.remove + ': ' + item.text} onClick={() => void act(() => apiRequest(base + '/' + item.id, { method: 'DELETE' })).catch(() => undefined)}>{c.remove}</Button></div>
              </div>}
        </li>)}</ul>
      </div>)}
    </div>)}
    <FactForm c={c} initial={blank} submitLabel={c.add} onSubmit={d => act(() => sendJson(base, 'POST', toBody(d)))} />
    {cvForRun && bank.data?.provider_configured && !active && <div><Button variant="outline" disabled={gate.blocked} title={gate.title} onClick={() => void act(() => apiRequest(`/async/projects/${projectId}/cvs/${cvForRun}/experience-extractions`, { method: 'POST' })).catch(() => undefined)}><Sparkles className="size-4" aria-hidden="true" />{extraction ? c.extract : c.extractFirst}</Button></div>}
  </section>;
}
