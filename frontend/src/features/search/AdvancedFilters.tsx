import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type Facet = { value: string; count: number; name_th?: string };
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
    ['product', 'บริษัทผลิตภัณฑ์', 'Product'], ['startup', 'สตาร์ทอัป', 'Startup'], ['agency', 'เอเจนซี', 'Agency'], ['outsource', 'รับจ้างพัฒนา', 'Outsource'],
    ['outstaff', 'ส่งบุคลากรประจำลูกค้า', 'Outstaff'], ['inhouse', 'ทีมภายในองค์กร', 'In-house'], ['government', 'หน่วยงานรัฐ', 'Government']] },
];
const SALARIES = [15000, 25000, 40000, 60000, 100000];

const copy = {
  th: { more: 'ตัวกรองเพิ่มเติม', skills: 'ทักษะ', skillsHint: (n: number) => `เลือกได้สูงสุด ${n} ทักษะ`, skillInput: 'เพิ่มทักษะ เช่น python', add: 'เพิ่ม', remove: (s: string) => `เอาทักษะ ${s} ออก`, suggest: 'ทักษะที่พบบ่อย',
    title: 'ตัวกรองทั้งหมด', clearAll: 'ล้างทั้งหมด', show: 'ดูผลลัพธ์', close: 'ปิด', navLabel: 'หมวดตัวกรอง', sec: { role: 'ตำแหน่ง', work: 'การจ้างงาน', skills: 'ทักษะ', pay: 'เงินเดือน', language: 'ภาษา' }, thai: 'ประกาศภาษาไทยเท่านั้น', thaiOnly: 'ภาษาไทย', salary: 'เงินเดือนขั้นต่ำ', anySalary: 'ไม่กำหนด', baht: (n: string) => `${n} บาท/เดือน`, salaryHint: 'ประกาศงานส่วนน้อยที่ระบุเงินเดือน การกรองนี้อาจตัดงานออกมาก', presets: 'ทางลัด', badLabel: 'ตัวกรองที่ใช้อยู่',
    preset: { internship: 'ฝึกงาน', junior: 'จูเนียร์', thai: 'ประกาศภาษาไทย', remote: 'ทำงานทางไกล', python: 'Python', ai: 'AI/ML' } },
  en: { more: 'More filters', skills: 'Skills', skillsHint: (n: number) => `Up to ${n} skills`, skillInput: 'Add a skill, e.g. python', add: 'Add', remove: (s: string) => `Remove skill ${s}`, suggest: 'Common skills',
    title: 'All filters', clearAll: 'Clear all', show: 'Show results', close: 'Close', navLabel: 'Filter groups', sec: { role: 'Role', work: 'Employment', skills: 'Skills', pay: 'Pay', language: 'Language' }, thai: 'Thai postings only', thaiOnly: 'Thai', salary: 'Minimum salary', anySalary: 'Any', baht: (n: string) => `${n} THB/month`, salaryHint: 'Few postings state a salary, so this filter may remove many jobs.', presets: 'Quick filters', badLabel: 'Active filters',
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

/** Display name of one advanced-filter value in the app language (chips); unknown values fall back to the raw text. */
export function advValueLabel(locale: 'th' | 'en', key: string, value: string): string {
  const c = copy[locale];
  if (key === 'salary_min') return c.baht(new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US').format(Number(value)));
  if (key === 'posting_language') return value === 'th' ? c.thaiOnly : value;
  const option = GROUPS.find(g => g.key === key)?.options.find(o => o[0] === value);
  return option ? option[locale === 'th' ? 1 : 2] : value;
}

export const advancedCount = (get: (k: string) => string) =>
  splitList(get('seniority')).length + splitList(get('employment_type')).length + splitList(get('company_type')).length + splitList(get('skills')).length
  + (get('posting_language') ? 1 : 0) + (get('salary_min') ? 1 : 0);

export function Presets({ locale, get, setMany }: { locale: 'th' | 'en'; get: (k: string) => string; setMany: (changes: Record<string, string>) => void }) {
  const c = copy[locale];
  return <div role="group" aria-label={c.presets} className="flex gap-2 sm:flex-wrap">
    {PRESETS.map(p => {
      const entries = Object.entries(p.params);
      const on = entries.every(([k, v]) => splitList(get(k)).sort().join(',') === v.split(',').sort().join(','));
      return <Button key={p.id} type="button" variant={on ? 'default' : 'outline'} size="sm" className="shrink-0 whitespace-nowrap" aria-pressed={on}
        onClick={() => setMany(Object.fromEntries(entries.map(([k, v]) => [k, on ? '' : v])))}>{c.preset[p.id]}</Button>;
    })}
  </div>;
}

type Section = 'role' | 'work' | 'skills' | 'pay' | 'language';
const SECTIONS: Section[] = ['role', 'work', 'skills', 'pay', 'language'];
export type FilterLabels = { categories: string; posted: string; anyPosted: string; days: (n: number) => string };

export function AdvancedFilters({ locale, get, setMany, facets, number, categories = [], catLabel, labels }: {
  locale: 'th' | 'en'; get: (k: string) => string; setMany: (changes: Record<string, string>) => void; facets?: AdvFacets; number: Intl.NumberFormat;
  categories?: Facet[]; catLabel: (slug: string) => string; labels: FilterLabels;
}) {
  const c = copy[locale];
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>('role');
  const [skillInput, setSkillInput] = useState('');
  const category = get('category');
  const posted = get('posted_within_days');
  const count = advancedCount(get) + (category ? 1 : 0) + (posted ? 1 : 0);
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
  const chipClass = 'h-auto min-h-11 gap-2 whitespace-normal rounded-full border-border px-3 lg:min-h-8 text-left aria-pressed:font-semibold';
  const countFor = (key: Section) => ({
    role: splitList(get('seniority')).length + (category ? 1 : 0) + (posted ? 1 : 0),
    work: splitList(get('employment_type')).length + splitList(get('company_type')).length,
    skills: skills.length, pay: get('salary_min') ? 1 : 0, language: get('posting_language') ? 1 : 0,
  })[key];
  const clearAll = () => setMany({ seniority: '', employment_type: '', company_type: '', skills: '', posting_language: '', salary_min: '', category: '', posted_within_days: '' });
  const group = (g: typeof GROUPS[number]) => {
    const counts = new Map((facets?.[g.key] ?? []).map(f => [f.value, f.count]));
    const selected = splitList(get(g.key));
    return <div key={g.key} role="group" aria-label={g[locale]} className="grid gap-3">
      <h3 className="text-sm font-semibold">{g[locale]}</h3>
      <div className="flex flex-wrap gap-2">
        {g.options.map(([value, thLabel, enLabel]) => {
          const n = counts.get(value);
          return <Button key={value} type="button" variant="outline" size="sm" className={chipClass} aria-pressed={selected.includes(value)} onClick={() => toggle(g.key, value)}>
            {locale === 'th' ? thLabel : enLabel}{n ? <span className="text-xs font-normal tabular-nums text-muted-foreground">{number.format(n)}</span> : null}
          </Button>;
        })}
      </div>
    </div>;
  };

  return <div className="shrink-0">
    <Button type="button" variant="outline" className="min-h-11 gap-2 whitespace-nowrap lg:min-h-10" aria-expanded={open} aria-controls="adv-filters" onClick={() => setOpen(true)}>
      <SlidersHorizontal className="size-4" aria-hidden="true" />
      {c.more}
      {count > 0 && <Badge variant="secondary" aria-label={`${c.badLabel}: ${count}`}>{count}</Badge>}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent id="adv-filters" className="h-[min(44rem,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
          <div className="min-w-0"><DialogTitle>{c.title}</DialogTitle><DialogDescription className="sr-only">{c.badLabel}</DialogDescription></div>
          <Button type="button" variant="ghost" size="icon" aria-label={c.close} onClick={() => setOpen(false)}><X className="size-5" aria-hidden="true" /></Button>
        </div>
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[13rem_minmax(0,1fr)] md:grid-rows-1">
          <nav aria-label={c.navLabel} className="flex gap-1 overflow-x-auto border-b p-2 md:flex-col md:overflow-y-auto md:border-b-0 md:border-e md:p-3">
            {SECTIONS.map(key => {
              const n = countFor(key);
              return <button key={key} type="button" aria-current={section === key ? 'true' : undefined} onClick={() => setSection(key)}
                className={cn('flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-full',
                  section === key ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>
                {c.sec[key]}{n > 0 && <Badge variant="secondary">{n}</Badge>}
              </button>;
            })}
          </nav>
          <div className="grid min-h-0 content-start gap-6 overflow-y-auto px-6 py-5">
            {section === 'role' && <>
              {group(GROUPS[0])}
              <div className="grid max-w-xs gap-2"><Label htmlFor="job-posted">{labels.posted}</Label>
                <Select id="job-posted" value={posted} onChange={e => setMany({ posted_within_days: e.target.value })}>
                  <option value="">{labels.anyPosted}</option>
                  {[7, 14, 30].map(d => <option key={d} value={String(d)}>{labels.days(d)}</option>)}
                </Select>
              </div>
              {categories.length > 0 && <div role="group" aria-label={labels.categories} className="grid gap-3">
                <h3 className="text-sm font-semibold">{labels.categories}</h3>
                <div className="flex flex-wrap gap-2">{categories.map(f => <Button key={f.value} type="button" variant="outline" size="sm" className={chipClass} aria-pressed={category === f.value}
                  onClick={() => setMany({ category: category === f.value ? '' : f.value })}>
                  {catLabel(f.value)}{f.count ? <span className="text-xs font-normal tabular-nums text-muted-foreground">{number.format(f.count)}</span> : null}
                </Button>)}</div>
              </div>}
            </>}
            {section === 'work' && <>{group(GROUPS[1])}{group(GROUPS[2])}</>}
            {section === 'skills' && <div role="group" aria-label={c.skills} className="grid gap-3">
              <h3 className="text-sm font-semibold">{c.skills} <span className="font-normal text-muted-foreground">· {c.skillsHint(MAX_SKILLS)}</span></h3>
              {skills.length > 0 && <div className="flex flex-wrap gap-2">
                {skills.map(s => <Button key={s} type="button" variant="outline" size="sm" className={chipClass} aria-pressed aria-label={c.remove(s)} onClick={() => toggle('skills', s)}>{s}<X className="size-3.5" aria-hidden="true" /></Button>)}
              </div>}
              <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addSkill(skillInput); }}>
                <Input aria-label={c.skillInput} placeholder={c.skillInput} value={skillInput} maxLength={41} disabled={skills.length >= MAX_SKILLS} onChange={e => setSkillInput(e.target.value)} />
                <Button type="submit" variant="outline" className="shrink-0 whitespace-nowrap" disabled={skills.length >= MAX_SKILLS || !SKILL_RE.test(skillInput.trim().toLowerCase())}>{c.add}</Button>
              </form>
              {suggestions.length > 0 && skills.length < MAX_SKILLS && <div className="grid gap-2">
                <span className="text-xs text-muted-foreground">{c.suggest}</span>
                <div className="flex flex-wrap gap-2">{suggestions.map(f => <Button key={f.value} type="button" variant="outline" size="sm" className={chipClass} onClick={() => addSkill(f.value)}>
                  {f.value}<span className="text-xs font-normal tabular-nums text-muted-foreground">{number.format(f.count)}</span></Button>)}</div>
              </div>}
            </div>}
            {section === 'pay' && <div className="grid max-w-xs gap-2">
              <Label htmlFor="adv-salary">{c.salary}</Label>
              <Select id="adv-salary" value={get('salary_min')} onChange={e => setMany({ salary_min: e.target.value })}>
                <option value="">{c.anySalary}</option>
                {SALARIES.map(n => <option key={n} value={String(n)}>{c.baht(number.format(n))}</option>)}
              </Select>
              <p className="text-xs text-muted-foreground">{c.salaryHint}</p>
            </div>}
            {section === 'language' && <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={get('posting_language') === 'th'} onChange={e => setMany({ posting_language: e.target.checked ? 'th' : '' })} />
              {c.thai}
            </label>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t p-2">
          <Button type="button" variant="ghost" disabled={count === 0} onClick={clearAll}>{c.clearAll}</Button>
          <Button type="button" onClick={() => setOpen(false)}>{c.show}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
