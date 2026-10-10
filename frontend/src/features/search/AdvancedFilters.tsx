import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type Facet = { value: string; count: number };
export type AdvFacets = { seniority?: Facet[]; employment_type?: Facet[]; company_type?: Facet[]; skills?: Facet[] };

export const ADV_KEYS = ['seniority', 'employment_type', 'company_type', 'skills', 'posting_language', 'salary_min'] as const;
export const splitList = (v: string) => (v ? v.split(',').filter(Boolean) : []);
const SKILL_RE = /^[a-z0-9][a-z0-9.+#-]{0,40}$/;
const MAX_SKILLS = 5;

type Option = [value: string, th: string, en: string];
const GROUPS: { key: 'seniority' | 'employment_type' | 'company_type'; th: string; en: string; options: Option[] }[] = [
  { key: 'seniority', th: 'ระดับตำแหน่ง', en: 'Seniority', options: [
    ['intern', 'ฝึกงาน', 'Intern'], ['junior', 'จูเนียร์', 'Junior'], ['middle', 'กลาง', 'Mid-level'], ['senior', 'ซีเนียร์', 'Senior'],
    ['lead', 'หัวหน้าทีม', 'Lead'], ['staff', 'Staff', 'Staff'], ['principal', 'Principal', 'Principal'], ['c_level', 'ผู้บริหาร', 'Executive']] },
  { key: 'employment_type', th: 'ประเภทการจ้าง', en: 'Employment type', options: [
    ['full_time', 'งานประจำ', 'Full-time'], ['part_time', 'พาร์ทไทม์', 'Part-time'], ['contract', 'สัญญาจ้าง', 'Contract'],
    ['internship', 'ฝึกงาน', 'Internship'], ['fellowship', 'ทุน/Fellowship', 'Fellowship']] },
  { key: 'company_type', th: 'ประเภทบริษัท', en: 'Company type', options: [
    ['product', 'Product', 'Product'], ['startup', 'Startup', 'Startup'], ['agency', 'Agency', 'Agency'], ['outsource', 'Outsource', 'Outsource'],
    ['outstaff', 'Outstaff', 'Outstaff'], ['inhouse', 'In-house', 'In-house'], ['government', 'หน่วยงานรัฐ', 'Government']] },
];
const SALARIES = [15000, 25000, 40000, 60000, 100000];

const copy = {
  th: { more: 'ตัวกรองเพิ่มเติม', skills: 'ทักษะ', skillsHint: (n: number) => `เลือกได้สูงสุด ${n} ทักษะ`, skillInput: 'เพิ่มทักษะ เช่น python', add: 'เพิ่ม', remove: (s: string) => `เอาทักษะ ${s} ออก`, suggest: 'ทักษะที่พบบ่อย',
    thai: 'ประกาศภาษาไทยเท่านั้น', salary: 'เงินเดือนขั้นต่ำ', anySalary: 'ไม่กำหนด', baht: (n: string) => `${n} บาท/เดือน`, salaryHint: 'ประกาศงานส่วนน้อยที่ระบุเงินเดือน การกรองนี้อาจตัดงานออกมาก', presets: 'ทางลัด', badLabel: 'ตัวกรองที่ใช้อยู่',
    preset: { internship: 'ฝึกงาน', junior: 'จูเนียร์', thai: 'ประกาศภาษาไทย', remote: 'ทำงานทางไกล', python: 'Python', ai: 'AI/ML' } },
  en: { more: 'More filters', skills: 'Skills', skillsHint: (n: number) => `Up to ${n} skills`, skillInput: 'Add a skill, e.g. python', add: 'Add', remove: (s: string) => `Remove skill ${s}`, suggest: 'Common skills',
    thai: 'Thai postings only', salary: 'Minimum salary', anySalary: 'Any', baht: (n: string) => `${n} THB/month`, salaryHint: 'Few postings state a salary, so this filter may remove many jobs.', presets: 'Quick filters', badLabel: 'Active filters',
    preset: { internship: 'Internship', junior: 'Junior', thai: 'Thai postings', remote: 'Remote', python: 'Python', ai: 'AI/ML' } },
};

const PRESETS: { id: keyof typeof copy.th.preset; params: Record<string, string> }[] = [
  { id: 'internship', params: { employment_type: 'internship' } },
  { id: 'junior', params: { seniority: 'intern,junior' } },
  { id: 'thai', params: { posting_language: 'th' } },
  { id: 'remote', params: { work_mode: 'remote' } },
  { id: 'python', params: { skills: 'python' } },
  { id: 'ai', params: { category: 'ai_engineering' } },
];

export const advancedCount = (get: (k: string) => string) =>
  splitList(get('seniority')).length + splitList(get('employment_type')).length + splitList(get('company_type')).length + splitList(get('skills')).length
  + (get('posting_language') ? 1 : 0) + (get('salary_min') ? 1 : 0);

export function Presets({ locale, get, setMany }: { locale: 'th' | 'en'; get: (k: string) => string; setMany: (changes: Record<string, string>) => void }) {
  const c = copy[locale];
  return <div role="group" aria-label={c.presets} className="flex flex-wrap gap-2">
    {PRESETS.map(p => {
      const entries = Object.entries(p.params);
      const on = entries.every(([k, v]) => splitList(get(k)).sort().join(',') === v.split(',').sort().join(','));
      return <Button key={p.id} type="button" variant={on ? 'default' : 'outline'} size="sm" className="min-h-9 whitespace-nowrap rounded-full" aria-pressed={on}
        onClick={() => setMany(Object.fromEntries(entries.map(([k, v]) => [k, on ? '' : v])))}>{c.preset[p.id]}</Button>;
    })}
  </div>;
}

export function AdvancedFilters({ locale, get, setMany, facets, number }: {
  locale: 'th' | 'en'; get: (k: string) => string; setMany: (changes: Record<string, string>) => void; facets?: AdvFacets; number: Intl.NumberFormat;
}) {
  const c = copy[locale];
  const [open, setOpen] = useState(false);
  const [skillInput, setSkillInput] = useState('');
  const count = advancedCount(get);
  const skills = splitList(get('skills'));
  const toggle = (key: string, value: string) => {
    const list = splitList(get(key));
    setMany({ [key]: (list.includes(value) ? list.filter(v => v !== value) : [...list, value]).join(',') });
  };
  const addSkill = (raw: string) => {
    const s = raw.trim().toLowerCase();
    if (!SKILL_RE.test(s) || skills.includes(s) || skills.length >= MAX_SKILLS) return;
    setMany({ skills: [...skills, s].join(',') }); setSkillInput('');
  };
  const suggestions = (facets?.skills ?? []).filter(f => !skills.includes(f.value) && SKILL_RE.test(f.value)).slice(0, 10);
  const chipClass = 'min-h-9 h-auto whitespace-normal rounded-full text-left';

  return <div className="grid gap-3">
    <div>
      <Button type="button" variant="outline" className="min-h-10 gap-2 whitespace-nowrap" aria-expanded={open} aria-controls="adv-filters" onClick={() => setOpen(o => !o)}>
        {c.more}
        {count > 0 && <Badge variant="secondary" aria-label={`${c.badLabel}: ${count}`}>{count}</Badge>}
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </Button>
    </div>
    {open && <div id="adv-filters" className="grid gap-5 rounded-xl border bg-card p-4">
      {GROUPS.map(g => {
        const counts = new Map((facets?.[g.key] ?? []).map(f => [f.value, f.count]));
        const selected = splitList(get(g.key));
        return <div key={g.key} role="group" aria-label={g[locale]} className="grid gap-2">
          <h3 className="text-sm font-semibold">{g[locale]}</h3>
          <div className="flex flex-wrap gap-2">
            {g.options.map(([value, thLabel, enLabel]) => {
              const n = counts.get(value);
              return <Button key={value} type="button" variant={selected.includes(value) ? 'default' : 'outline'} size="sm" className={chipClass} aria-pressed={selected.includes(value)} onClick={() => toggle(g.key, value)}>
                {locale === 'th' ? thLabel : enLabel}{n ? <span className="opacity-70">{number.format(n)}</span> : null}
              </Button>;
            })}
          </div>
        </div>;
      })}

      <div role="group" aria-label={c.skills} className="grid gap-2">
        <h3 className="text-sm font-semibold">{c.skills} <span className="font-normal text-muted-foreground">· {c.skillsHint(MAX_SKILLS)}</span></h3>
        {skills.length > 0 && <div className="flex flex-wrap gap-2">
          {skills.map(s => <Button key={s} type="button" size="sm" className={chipClass} aria-label={c.remove(s)} onClick={() => toggle('skills', s)}>{s}<X className="size-3.5" aria-hidden="true" /></Button>)}
        </div>}
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addSkill(skillInput); }}>
          <Input aria-label={c.skillInput} placeholder={c.skillInput} value={skillInput} maxLength={41} disabled={skills.length >= MAX_SKILLS} onChange={e => setSkillInput(e.target.value)} />
          <Button type="submit" variant="outline" className="shrink-0 whitespace-nowrap" disabled={skills.length >= MAX_SKILLS || !SKILL_RE.test(skillInput.trim().toLowerCase())}>{c.add}</Button>
        </form>
        {suggestions.length > 0 && skills.length < MAX_SKILLS && <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{c.suggest}</span>
          {suggestions.map(f => <Button key={f.value} type="button" variant="outline" size="sm" className={chipClass} onClick={() => addSkill(f.value)}>{f.value}<span className="text-muted-foreground">{number.format(f.count)}</span></Button>)}
        </div>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-primary" checked={get('posting_language') === 'th'} onChange={e => setMany({ posting_language: e.target.checked ? 'th' : '' })} />
          {c.thai}
        </label>
        <div className="grid gap-2">
          <Label htmlFor="adv-salary">{c.salary}</Label>
          <select id="adv-salary" className="min-h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={get('salary_min')} onChange={e => setMany({ salary_min: e.target.value })}>
            <option value="">{c.anySalary}</option>
            {SALARIES.map(n => <option key={n} value={String(n)}>{c.baht(number.format(n))}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">{c.salaryHint}</p>
        </div>
      </div>
    </div>}
  </div>;
}
