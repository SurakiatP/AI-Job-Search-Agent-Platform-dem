import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Info, Loader2, MapPin, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SessionView } from '../../lib/api-types';
import { sendJson, useResource } from '../projects/useResource';
import { sampleJobs, type SampleJob } from './sampleJobs';

const copy = {
  th: {
    title: 'ค้นหางาน', banner: 'นี่คือตัวอย่างหน้าค้นหางาน ข้อมูลทั้งหมดเป็นข้อมูลสมมติ ระบบค้นหาจริงอยู่ระหว่างพัฒนา',
    searchLabel: 'ค้นหาตำแหน่งหรือบริษัท', searchPlaceholder: 'เช่น Frontend หรือ ชื่อบริษัท', filters: 'ตัวกรอง',
    province: 'จังหวัด', salary: 'เงินเดือนขั้นต่ำ', anySalary: 'ไม่ระบุ', mode: 'รูปแบบการทำงาน', clear: 'ล้างตัวกรอง',
    count: (n: number) => `พบ ${n} ตำแหน่ง`, perMonth: 'บาท/เดือน', sample: 'ตัวอย่าง',
    onsite: 'ทำงานที่ออฟฟิศ', hybrid: 'ไฮบริด', remote: 'ทำงานทางไกล',
    evaluate: 'ประเมินงานนี้', saving: 'กำลังบันทึก…', error: 'บันทึกงานไม่สำเร็จ ลองอีกครั้ง',
    none: 'ไม่พบตำแหน่งที่ตรงกับตัวกรอง', noneNext: 'ลองเปลี่ยนคำค้นหาหรือล้างตัวกรองเพื่อดูทั้งหมด',
  },
  en: {
    title: 'Job search', banner: 'This is a preview with fictional data. Real job search is in development.',
    searchLabel: 'Search title or company', searchPlaceholder: 'e.g. Frontend or a company name', filters: 'Filters',
    province: 'Province', salary: 'Minimum salary', anySalary: 'Any', mode: 'Work mode', clear: 'Clear filters',
    count: (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'} found`, perMonth: 'THB/month', sample: 'Sample',
    onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote',
    evaluate: 'Evaluate this job', saving: 'Saving…', error: 'Could not save this job. Try again.',
    none: 'No jobs match these filters', noneNext: 'Change the search or clear the filters to see everything.',
  },
};

type Mode = SampleJob['remote'];
const provinces = [...new Set(sampleJobs.map(job => job.province))];
const modes: Mode[] = ['onsite', 'hybrid', 'remote'];
const salaryOptions = [0, 30000, 50000, 70000];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value];
}

export function SearchPage() {
  const { i18n } = useTranslation();
  const locale: 'th' | 'en' = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const number = useMemo(() => new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US'), [locale]);
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const sessions = useResource<SessionView[]>(`/projects/${projectId}/sessions`);
  const [query, setQuery] = useState('');
  const [selectedProvinces, setSelectedProvinces] = useState<string[]>([]);
  const [selectedModes, setSelectedModes] = useState<Mode[]>([]);
  const [minSalary, setMinSalary] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const results = sampleJobs.filter(job =>
    (!needle || `${job.title} ${job.company}`.toLowerCase().includes(needle))
    && (!selectedProvinces.length || selectedProvinces.includes(job.province))
    && (!selectedModes.length || selectedModes.includes(job.remote))
    && job.salaryMax >= minSalary);
  const filtered = Boolean(needle || selectedProvinces.length || selectedModes.length || minSalary);

  function clear() {
    setQuery(''); setSelectedProvinces([]); setSelectedModes([]); setMinSalary(0);
  }

  async function evaluate(job: SampleJob) {
    if (savingId) return;
    setSavingId(job.id); setErrorId(null);
    try {
      const created = await sendJson<{ id: string }>(`/projects/${projectId}/jobs`, 'POST', {
        title: job.title, description: job.description, company: job.company, source_url: null,
      });
      const base = `/app/projects/${projectId}`;
      const first = sessions.data?.[0];
      void navigate(first ? `${base}/sessions/${first.id}` : `${base}/profile`, { state: { jobId: created.id } });
    } catch {
      setErrorId(job.id); setSavingId(null);
    }
  }

  const filterFields = (prefix: string) => <div className="grid gap-5">
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{c.province}</legend>
      {provinces.map(p => <label key={p} className="flex min-h-8 items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={selectedProvinces.includes(p)} onChange={() => setSelectedProvinces(list => toggle(list, p))} />
        <span className="min-w-0 break-words">{p}</span>
      </label>)}
    </fieldset>
    <div className="grid gap-2">
      <Label htmlFor={`${prefix}-salary`}>{c.salary}</Label>
      <select id={`${prefix}-salary`} value={minSalary} onChange={event => setMinSalary(Number(event.target.value))}
        className="min-h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {salaryOptions.map(v => <option key={v} value={v}>{v ? `${number.format(v)}+ ${c.perMonth}` : c.anySalary}</option>)}
      </select>
    </div>
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{c.mode}</legend>
      {modes.map(m => <label key={m} className="flex min-h-8 items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={selectedModes.includes(m)} onChange={() => setSelectedModes(list => toggle(list, m))} />
        <span>{c[m]}</span>
      </label>)}
    </fieldset>
    <Button variant="outline" size="sm" className="justify-self-start" onClick={clear} disabled={!filtered}>{c.clear}</Button>
  </div>;

  return <section className="grid gap-6">
    <h1 className="min-w-0 break-words text-2xl font-semibold">{c.title}</h1>
    <Card className="border-transparent bg-accent text-accent-foreground">
      <CardContent className="flex items-start gap-3 p-4">
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 break-words text-sm font-medium">{c.banner}</p>
      </CardContent>
    </Card>
    <div className="grid gap-2">
      <Label htmlFor="job-search">{c.searchLabel}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input id="job-search" type="search" className="pl-9" value={query} placeholder={c.searchPlaceholder} onChange={event => setQuery(event.target.value)} />
      </div>
    </div>
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      <details className="rounded-xl border bg-card p-4 lg:hidden">
        <summary className="cursor-pointer text-sm font-semibold">{c.filters}</summary>
        <div className="mt-4">{filterFields('m')}</div>
      </details>
      <Card className="hidden lg:block"><CardContent className="grid gap-4 p-5">
        <h2 className="font-semibold">{c.filters}</h2>
        {filterFields('d')}
      </CardContent></Card>
      <div className="grid min-w-0 gap-4">
        <p role="status" className="text-sm text-muted-foreground">{c.count(results.length)}</p>
        {results.length === 0 && <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6">
          <p className="font-medium">{c.none}</p>
          <p className="text-sm text-muted-foreground">{c.noneNext}</p>
          <Button variant="outline" size="sm" onClick={clear}>{c.clear}</Button>
        </div>}
        <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
          {results.map(job => <Card key={job.id}>
            <CardContent className="grid gap-3 p-5">
              <div className="min-w-0">
                <h2 className="break-words font-semibold leading-snug">{job.title}</h2>
                <p className="break-words text-sm text-muted-foreground">{job.company}</p>
              </div>
              <p className="flex items-start gap-1 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{job.province}</span>
              </p>
              <p className="break-words text-sm font-medium">{number.format(job.salaryMin)} – {number.format(job.salaryMax)} {c.perMonth}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{c[job.remote]}</Badge>
                <Badge variant="outline">{c.sample}</Badge>
                {job.tags.map(tag => <Badge key={tag} variant="outline" className="break-words">{tag}</Badge>)}
              </div>
              {errorId === job.id && <p role="alert" className="text-sm text-destructive">{c.error}</p>}
              <Button className="h-auto justify-self-start whitespace-normal text-left" disabled={savingId !== null} aria-busy={savingId === job.id} onClick={() => void evaluate(job)}>
                {savingId === job.id ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" />{c.saving}</> : c.evaluate}
              </Button>
            </CardContent>
          </Card>)}
        </div>
      </div>
    </div>
  </section>;
}
