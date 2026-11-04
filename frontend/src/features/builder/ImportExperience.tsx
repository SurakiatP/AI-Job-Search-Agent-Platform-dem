import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { FileDown } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import type { ExperienceItem, ExperienceView } from '../../lib/api-types';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { BusyNote } from '../../components/BusyNote';
import type { Lang, ResumeData } from './sections';

const copy = {
  th: { open: 'ดึงจากประสบการณ์ของฉัน', title: 'เลือกข้อมูลจากประสบการณ์ของคุณ', body: 'ติ๊กเฉพาะรายการที่อยากใส่ใน CV ฉบับนี้ หลังใส่แล้วแก้ไขหรือลบได้ในแบบฟอร์มเหมือนเดิม',
    empty: 'ยังไม่มีข้อมูลในข้อเท็จจริงของฉัน เพิ่มได้ที่หน้า CV และประสบการณ์', loadFailed: 'โหลดข้อเท็จจริงของฉันไม่สำเร็จ', retry: 'ลองอีกครั้ง', all: 'เลือกทั้งหมด', none: 'ไม่เลือกเลย',
    add: (n: number) => `ใส่ลงใน CV (${n})`, cancel: 'ยกเลิก', failed: 'ดึงข้อมูลไม่สำเร็จ ลองอีกครั้ง', noRole: 'ไม่ระบุตำแหน่ง', loading: 'กำลังโหลด…',
    kinds: { experience: 'ประสบการณ์ทำงาน', education: 'การศึกษา', skill: 'ทักษะ', certification: 'ใบรับรอง', project: 'โครงการ', other: 'อื่น ๆ', language: 'ภาษา', award: 'รางวัลและเกียรติบัตร', publication: 'ผลงานตีพิมพ์', volunteer: 'งานอาสาสมัคร', interest: 'ความสนใจ' } as Record<string, string> },
  en: { open: 'Pick from my experience', title: 'Choose from your experience', body: 'Tick only what belongs in this CV. Once added you can edit or remove it in the form as usual.',
    empty: 'Your facts is empty. Add items on the CV and experience page.', loadFailed: 'Could not load your experience', retry: 'Try again', all: 'Select all', none: 'Select none',
    add: (n: number) => `Add to CV (${n})`, cancel: 'Cancel', failed: 'Could not add them. Try again.', noRole: 'No title', loading: 'Loading…',
    kinds: { experience: 'Work experience', education: 'Education', skill: 'Skills', certification: 'Certifications', project: 'Projects', other: 'Other', language: 'Languages', award: 'Awards', publication: 'Publications', volunteer: 'Volunteering', interest: 'Interests' } as Record<string, string> },
};

const heading = (i: ExperienceItem, none: string) => i.kind === 'experience' || i.kind === 'project' ? [i.role, i.organization].filter(Boolean).join(' · ') || none : '';

// Button + picker: the chosen bank items come back as resume sections from the server; `onAdd` merges them into the draft.
export function ImportExperience({ projectId, base, locale, onAdd }: { projectId: string; base: string; locale: Lang; onAdd: (add: ResumeData) => void }) {
  const c = copy[locale];
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ExperienceItem[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [state, setState] = useState<'idle' | 'loadFailed' | 'adding' | 'failed'>('idle');

  async function show() {
    setOpen(true); setState('idle'); setItems(null);
    try {
      const view = await apiRequest<ExperienceView>(`/projects/${projectId}/experience`);
      setItems(view.items); setPicked(new Set(view.items.map(i => i.id)));
    } catch { setState('loadFailed'); }
  }
  async function add() {
    setState('adding');
    try {
      const { resume_data } = await apiRequest<{ resume_data: ResumeData }>(`${base}/from-experience`, { method: 'POST', body: JSON.stringify({ item_ids: [...picked] }) });
      onAdd(resume_data); setOpen(false); setState('idle');
    } catch { setState('failed'); }
  }
  const toggle = (id: string) => setPicked(old => { const next = new Set(old); if (!next.delete(id)) next.add(id); return next; });
  const kinds = Object.keys(c.kinds).filter(k => items?.some(i => i.kind === k));

  return <>
    <Button variant="outline" onClick={() => void show()}><FileDown className="size-4" aria-hidden="true" />{c.open}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogTitle>{c.title}</DialogTitle>
        <DialogDescription>{c.body}</DialogDescription>
        {state === 'loadFailed' && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">{c.loadFailed}<Button size="sm" variant="outline" onClick={() => void show()}>{c.retry}</Button></div>}
        {!items && state !== 'loadFailed' && <BusyNote locale={locale} label={c.loading} />}
        {items && items.length === 0 && <p className="text-sm text-muted-foreground">{c.empty}</p>}
        {items && items.length > 0 && <>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setPicked(new Set(items.map(i => i.id)))}>{c.all}</Button>
            <Button size="sm" variant="outline" onClick={() => setPicked(new Set())}>{c.none}</Button></div>
          {kinds.map(kind => <fieldset key={kind} className="grid gap-2"><legend className="mb-1 text-sm font-semibold">{c.kinds[kind]}</legend>
            {items.filter(i => i.kind === kind).map(i => <label key={i.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="checkbox" className="mt-0.5 size-5 accent-primary" checked={picked.has(i.id)} onChange={() => toggle(i.id)} />
              <span className="grid gap-0.5">{heading(i, c.noRole) && <span className="font-medium">{heading(i, c.noRole)}</span>}<span>{i.text}</span></span>
            </label>)}
          </fieldset>)}
        </>}
        {state === 'failed' && <Alert severity="error">{c.failed}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>{c.cancel}</Button>
          <Button busy={state === 'adding'} disabled={picked.size === 0} onClick={() => void add()}>{c.add(picked.size)}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
