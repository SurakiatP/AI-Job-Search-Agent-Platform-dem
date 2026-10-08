import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Bookmark, BookmarkCheck, Building2, ExternalLink, Loader2, MapPin, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '../../lib/api';
import { ApiError, type CVView } from '../../lib/api-types';
import { CvPreviewButton } from '@/components/CvPreview';
import { NewSessionButton } from '../sessions/NewSessionDialog';
import { safeHttpUrl, sendJson, useResource } from '../projects/useResource';
import { Markdown } from '@/components/Markdown';
import { PageBack } from '@/components/PageBack';
import { sampleJobs } from './sampleJobs';

type JobSearchItem = {
  slug: string; title: string; company: string | null; location: string | null; cities: string[];
  work_mode: string | null; skills: string[]; category: string | null; posted_at: string | null;
  age_days: number | null; stale: boolean; source_url: string | null; description_markdown: string;
  match?: Match | null;
};
type Match = { score_percent: number; matched: string[]; missing: string[]; required_count: number };
type Facet = { value: string; count: number };
type Facets = { total: number; categories: Facet[]; cities: Facet[] };
type Page = { items: JobSearchItem[]; total: number; limit?: number; pool?: number; offset: number };

const PAGE_SIZE = 20;
const POOL_SIZE = 100;
// Best match first, then newest; postings with too few recognisable skills (match null) go last.
const byMatch = (a: JobSearchItem, b: JobSearchItem) =>
  Number(!a.match) - Number(!b.match) || (b.match?.score_percent ?? 0) - (a.match?.score_percent ?? 0) || (a.age_days ?? 1e6) - (b.age_days ?? 1e6);
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
});
const FILTER_KEYS = ['q', 'cities', 'work_mode', 'posted_within_days', 'category'] as const;

const copy = {
  th: {
    title: 'ค้นหางาน', subtitle: (n: string) => `งานในประเทศไทย ${n} ตำแหน่ง`,
    searchLabel: 'ค้นหาตำแหน่ง บริษัท หรือทักษะ', searchPlaceholder: 'เช่น Frontend, Data analyst หรือชื่อบริษัท',
    mode: 'รูปแบบการทำงาน', anyMode: 'ทุกแบบ', posted: 'ช่วงเวลาที่ลงประกาศ', anyPosted: 'ทุกช่วง',
    days: (n: number) => `${n} วันที่ผ่านมา`, city: 'จังหวัด/เมือง', anyCity: 'ทุกเมือง', categories: 'หมวดงาน',
    remote: 'ทำงานทางไกล', hybrid: 'ไฮบริด', onsite: 'ทำงานที่ออฟฟิศ',
    found: (n: string) => `พบ ${n} ตำแหน่ง`, age: (n: number) => (n <= 0 ? 'ลงประกาศวันนี้' : `ลงประกาศ ${n} วันที่แล้ว`),
    stale: 'ประกาศเก่า · อาจปิดรับแล้ว', evaluate: 'ประเมินงานนี้', save: 'บันทึกงาน', saved: 'บันทึกแล้ว', saving: 'กำลังบันทึก…',
    original: 'เปิดประกาศต้นฉบับ', saveError: 'บันทึกงานไม่สำเร็จ ลองอีกครั้ง', loadMore: 'โหลดเพิ่ม', loading: 'กำลังโหลด…',
    none: 'ไม่พบตำแหน่งที่ตรงกับตัวกรอง', noneNext: 'ลองเปลี่ยนคำค้นหาหรือล้างตัวกรองเพื่อดูทั้งหมด', clear: 'ล้างตัวกรอง',
    errTitle: 'ไม่สามารถเชื่อมต่อแหล่งข้อมูลงานได้', errBody: 'แหล่งข้อมูลอาจไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง หรือดูข้อมูลตัวอย่างเพื่อสำรวจหน้านี้',
    retry: 'ลองอีกครั้ง', viewSample: 'ดูข้อมูลตัวอย่าง', backLive: 'กลับไปข้อมูลจริง',
    sampleBanner: 'ข้อมูลตัวอย่าง', sampleBody: 'ข้อมูลทั้งหมดในมุมมองนี้เป็นข้อมูลสมมติ ไม่ใช่ประกาศงานจริง',
    description: 'รายละเอียดงาน', credit: 'แหล่งข้อมูลงานโอเพนซอร์ส (MIT)', untitled: 'ไม่ระบุบริษัท',
    cats: { frontend: 'Frontend', backend: 'Backend', fullstack: 'Fullstack', design: 'ดีไซน์', devops: 'DevOps', data_analytics: 'วิเคราะห์ข้อมูล', finance: 'การเงิน' } as Record<string, string>,
    modeSearch: 'ค้นหาทั่วไป', modeMatch: 'Smart match', modeLabel: 'โหมดการค้นหา',
    cvLabel: 'CV ที่ใช้จับคู่', noCv: 'ยังไม่มี CV ในโปรเจกต์นี้', noCvBody: 'เพิ่ม CV ก่อน เพื่อให้ระบบเทียบทักษะกับประกาศงานได้', addCv: 'ไปที่หน้า CV',
    analyzing: 'กำลังวิเคราะห์ CV…', analyzeError: 'วิเคราะห์ CV ไม่สำเร็จ ลองอีกครั้ง',
    poolNote: (n: string) => `จัดอันดับจาก ${n} ตำแหน่งล่าสุดที่ตรงกับตัวกรอง`,
    matchBadge: (p: number, m: number, n: number) => `ตรงกับ CV ${p}% · ${m}/${n} ทักษะ`, noSkills: 'ข้อมูลทักษะไม่พอ',
    matchedSkills: 'ทักษะที่ตรงกับ CV', missingSkills: 'ทักษะที่ยังขาด', noneMatched: 'ไม่มี', matchNote: 'คำนวณจากคำสำคัญในประกาศและ CV โดยไม่ใช้ AI',
    sampleMatch: 'Smart match ใช้กับข้อมูลตัวอย่างไม่ได้ จึงแสดงรายการโดยไม่มีคะแนน', loadMorePool: 'โหลดเพิ่ม',
  },
  en: {
    title: 'Job search', subtitle: (n: string) => `${n} jobs in Thailand`,
    searchLabel: 'Search title, company or skill', searchPlaceholder: 'e.g. Frontend, Data analyst or a company',
    mode: 'Work mode', anyMode: 'Any', posted: 'Posted within', anyPosted: 'Any time',
    days: (n: number) => `${n} days`, city: 'City', anyCity: 'All cities', categories: 'Categories',
    remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site',
    found: (n: string) => `${n} ${n === '1' ? 'job' : 'jobs'} found`, age: (n: number) => (n <= 0 ? 'Posted today' : `${n} ${n === 1 ? 'day' : 'days'} ago`),
    stale: 'Stale listing', evaluate: 'Evaluate this job', save: 'Save job', saved: 'Saved', saving: 'Saving…',
    original: 'Open original posting', saveError: 'Could not save this job. Try again.', loadMore: 'Load more', loading: 'Loading…',
    none: 'No jobs match these filters', noneNext: 'Change the search or clear the filters to see everything.', clear: 'Clear filters',
    errTitle: "Couldn't reach the job source", errBody: 'The job source may be temporarily unavailable. Try again, or view sample data to explore this page.',
    retry: 'Retry', viewSample: 'View sample data', backLive: 'Back to live data',
    sampleBanner: 'Sample', sampleBody: 'Everything in this view is fictional sample data, not real postings.',
    description: 'Job description', credit: 'Open-source job data source (MIT)', untitled: 'Company not listed',
    cats: { frontend: 'Frontend', backend: 'Backend', fullstack: 'Fullstack', design: 'Design', devops: 'DevOps', data_analytics: 'Data analytics', finance: 'Finance' } as Record<string, string>,
    modeSearch: 'Search', modeMatch: 'Smart match', modeLabel: 'Search mode',
    cvLabel: 'CV to match against', noCv: 'This project has no CV yet', noCvBody: 'Add a CV first so skills can be compared with each posting.', addCv: 'Go to the CV page',
    analyzing: 'Analyzing your CV…', analyzeError: 'Could not analyze the CV. Try again.',
    poolNote: (n: string) => `Ranked from the ${n} latest jobs matching your filters`,
    matchBadge: (p: number, m: number, n: number) => `${p}% CV match · ${m}/${n} skills`, noSkills: 'Not enough skill data',
    matchedSkills: 'Skills matching your CV', missingSkills: 'Skills missing from your CV', noneMatched: 'None', matchNote: 'Calculated from keywords in the posting and your CV, without AI',
    sampleMatch: 'Smart match does not work on sample data, so jobs are shown without scores', loadMorePool: 'Load more',
  },
};
type Copy = typeof copy.th;

const humanize = (slug: string) => { const s = slug.replace(/[_-]+/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };

const sampleItems: JobSearchItem[] = sampleJobs.map(j => ({
  slug: j.id, title: j.title, company: j.company, location: j.province, cities: [j.province], work_mode: j.remote,
  skills: j.tags, category: null, posted_at: null, age_days: null, stale: false, source_url: null, description_markdown: j.description,
}));

function useWide() {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on); on();
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

const selectClass = 'min-h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const matchVariant = (p: number) => (p >= 70 ? 'success' : p >= 40 ? 'warning' : 'secondary') as 'success' | 'warning' | 'secondary';

function MatchBadge({ match, c }: { match: Match | null | undefined; c: Copy }) {
  if (!match) return <Badge variant="secondary">{c.noSkills}</Badge>;
  return <Badge variant={matchVariant(match.score_percent)}>{c.matchBadge(match.score_percent, match.matched.length, match.required_count)}</Badge>;
}

function MatchSummary({ match, c }: { match: Match | null | undefined; c: Copy }) {
  return <div className="grid gap-3 rounded-lg border bg-muted/40 p-4">
    <MatchBadge match={match} c={c} />
    {match && <>
      <div className="grid gap-1.5"><h3 className="text-sm font-semibold">{c.matchedSkills}</h3>
        <div className="flex flex-wrap gap-1.5">{match.matched.length ? match.matched.map(s => <Badge key={s} variant="success" className="break-words">{s}</Badge>) : <span className="text-sm text-muted-foreground">{c.noneMatched}</span>}</div></div>
      <div className="grid gap-1.5"><h3 className="text-sm font-semibold">{c.missingSkills}</h3>
        <div className="flex flex-wrap gap-1.5">{match.missing.length ? match.missing.map(s => <Badge key={s} variant="outline" className="break-words">{s}</Badge>) : <span className="text-sm text-muted-foreground">{c.noneMatched}</span>}</div></div>
    </>}
    <p className="text-xs text-muted-foreground">{c.matchNote}</p>
  </div>;
}

type SavedJob = { id: string; title: string; company?: string | null; source_url?: string | null };

// Saves the posting to this project's saved jobs; a posting already saved (same link, or same title and company) links to it instead.
function SaveJobButton({ job, c, projectId }: { job: JobSearchItem; c: Copy; projectId: string }) {
  const saved = useResource<SavedJob[]>(`/projects/${projectId}/jobs`);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const source = safeHttpUrl(job.source_url);
  const match = (saved.data ?? []).find(item => (source && item.source_url === source) || (item.title === job.title && (item.company ?? '') === (job.company ?? '')));
  if (match) return <Button asChild variant="outline" className="h-auto whitespace-normal text-left"><Link to={`/app/projects/${projectId}/jobs/${match.id}`}><BookmarkCheck className="size-4 text-primary" aria-hidden="true" />{c.saved}</Link></Button>;
  async function save() {
    setState('saving');
    try {
      await sendJson(`/projects/${projectId}/jobs`, 'POST', { title: job.title.slice(0, 300), company: job.company?.slice(0, 300) || null, source_url: source ?? null, description: job.description_markdown.slice(0, 50000) || job.title });
      setState('idle'); saved.reload();
    } catch { setState('error'); }
  }
  return <>
    <Button type="button" variant="outline" className="h-auto whitespace-normal text-left" disabled={state === 'saving' || saved.status === 'loading'} onClick={() => void save()}>
      {state === 'saving' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}{state === 'saving' ? c.saving : c.save}
    </Button>
    {state === 'error' && <p role="alert" className="basis-full text-sm text-destructive">{c.saveError}</p>}
  </>;
}

function JobDetail({ job, c, projectId, scored }: { job: JobSearchItem; c: Copy; projectId: string; scored: boolean }) {
  const source = safeHttpUrl(job.source_url);
  const modeLabel = job.work_mode ? (c as unknown as Record<string, string>)[job.work_mode] ?? job.work_mode : null;
  return <div className="grid gap-4">
    <div className="min-w-0">
      <h2 className="break-words text-xl font-semibold leading-snug">{job.title}</h2>
      <p className="mt-1 flex items-start gap-1 break-words text-sm text-muted-foreground"><Building2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="min-w-0">{job.company ?? c.untitled}</span></p>
      {job.location && <p className="flex items-start gap-1 break-words text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="min-w-0">{job.location}</span></p>}
    </div>
    {scored && <MatchSummary match={job.match} c={c} />}
    <div className="flex flex-wrap gap-2">
      {modeLabel && <Badge variant="secondary">{modeLabel}</Badge>}
      {job.age_days != null && <Badge variant="outline">{c.age(job.age_days)}</Badge>}
      {job.stale && <Badge variant="warning">{c.stale}</Badge>}
      {job.skills.map(s => <Badge key={s} variant="outline" className="break-words">{s}</Badge>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <NewSessionButton projectId={projectId} className="h-auto whitespace-normal text-left" job={{ inline: { title: job.title, company: job.company, description: job.description_markdown.slice(0, 50000), source_url: safeHttpUrl(job.source_url) } }}>
        {c.evaluate}
      </NewSessionButton>
      <SaveJobButton key={job.slug} job={job} c={c} projectId={projectId} />
      {source && <Button asChild variant="outline" className="h-auto whitespace-normal text-left">
        <a href={source} target="_blank" rel="noreferrer">{c.original}<ExternalLink className="size-4" aria-hidden="true" /></a>
      </Button>}
    </div>
    <div className="grid gap-2 border-t pt-4">
      <h3 className="text-sm font-semibold">{c.description}</h3>
      <Markdown className="text-sm">{job.description_markdown}</Markdown>
    </div>
  </div>;
}

export function SearchPage() {
  const { t, i18n } = useTranslation();
  const locale: 'th' | 'en' = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const number = useMemo(() => new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US'), [locale]);
  const { projectId = '' } = useParams();
  const wide = useWide();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const city = params.get('cities') ?? '';
  const mode = params.get('work_mode') ?? '';
  const posted = params.get('posted_within_days') ?? '';
  const category = params.get('category') ?? '';
  const filtered = Boolean(q || city || mode || posted || category);
  const smart = params.get('mode') === 'match';
  const setSearchMode = (next: 'search' | 'match') => setParams(prev => {
    const out = new URLSearchParams(prev);
    if (next === 'match') out.set('mode', 'match'); else out.delete('mode');
    return out;
  }, { replace: true });

  const setFilter = useCallback((key: typeof FILTER_KEYS[number], value: string) => {
    setParams(prev => { const next = new URLSearchParams(prev); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true });
  }, [setParams]);
  const clear = () => { setQInput(''); setParams(smart ? new URLSearchParams({ mode: 'match' }) : new URLSearchParams(), { replace: true }); };

  // Debounced search box -> URL.
  const [qInput, setQInput] = useState(q);
  useEffect(() => { setQInput(q); }, [q]);
  useEffect(() => {
    if (qInput.trim() === q) return;
    const timer = setTimeout(() => setFilter('q', qInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [qInput, q, setFilter]);

  const [sample, setSample] = useState(false);
  const facetsRes = useResource<Facets>(sample ? null : `/projects/${projectId}/job-search/facets`);

  const smartActive = smart && !sample;
  const cvs = useResource<CVView[]>(smartActive ? `/projects/${projectId}/cvs` : null);
  const usable = (cvs.data ?? []).filter(item => item.latest_revision);
  const [cvPick, setCvPick] = useState('');
  const cv = usable.find(item => item.id === cvPick) ?? usable.find(item => item.is_primary) ?? usable[0];
  const cvId = cv?.id ?? '';
  const revisionId = cv?.latest_revision?.id ?? '';
  const needsCv = smartActive && cvs.status === 'ready' && usable.length === 0;
  const [profiling, setProfiling] = useState(false);
  const [profileFailed, setProfileFailed] = useState(false);
  const profiled = useRef('');
  const [nextOffset, setNextOffset] = useState(POOL_SIZE);

  const filterKey = useMemo(() => new URLSearchParams({ q, cities: city, work_mode: mode, posted_within_days: posted, category, smart: smartActive ? revisionId : '' }).toString(), [q, city, mode, posted, category, smartActive, revisionId]);
  const [items, setItems] = useState<JobSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [version, setVersion] = useState(0);
  const keyRef = useRef(filterKey);
  keyRef.current = filterKey;

  const buildPath = useCallback((offset: number) => {
    const search = new URLSearchParams();
    if (smartActive) { search.set('cv_revision_id', revisionId); search.set('pool', String(POOL_SIZE)); }
    if (q) search.set('q', q);
    if (mode) search.set('work_mode', mode);
    if (posted) search.set('posted_within_days', posted);
    if (category) search.set('category', category);
    if (!smartActive) search.set('limit', String(PAGE_SIZE));
    search.set('offset', String(offset));
    return `/projects/${projectId}/job-search${smartActive ? '/match' : ''}?${search.toString()}`;
  }, [projectId, q, city, mode, posted, category, smartActive, revisionId]);

  // Extracts the CV's skill names in the sandbox (no AI), then waits for the run to finish.
  async function profileCv(id: string, signal: AbortSignal) {
    const first = await apiRequest<{ status?: string; id?: string }>(`/projects/${projectId}/cvs/${id}/profile`, { method: 'POST', signal });
    if (first.status === 'ready' || !first.id) return;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(1500, signal);
      const run = await apiRequest<{ status: string }>(`/projects/${projectId}/runs/${first.id}`, { signal });
      if (run.status === 'completed') return;
      if (['failed', 'cancelled', 'interrupted'].includes(run.status)) throw new Error('profile_failed');
    }
    throw new Error('profile_timeout');
  }

  useEffect(() => {
    if (sample) return;
    setStatus('loading'); setItems([]); setMoreError(false); setProfiling(false); setProfileFailed(false); setNextOffset(POOL_SIZE);
    if (smart && !revisionId) return;
    const controller = new AbortController();
    apiRequest<Page>(buildPath(0), { signal: controller.signal })
      .then(page => { if (!controller.signal.aborted) { setItems(page.items); setTotal(page.total); setStatus('ready'); } })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (smart && error instanceof ApiError && error.code === 'cv_profile_missing' && profiled.current !== revisionId) {
          profiled.current = revisionId; setProfiling(true);
          profileCv(cvId, controller.signal)
            .then(() => { if (!controller.signal.aborted) setVersion(v => v + 1); })
            .catch(() => { if (!controller.signal.aborted) { setProfiling(false); setProfileFailed(true); setStatus('error'); } });
          return;
        }
        setStatus('error');
      });
    return () => controller.abort();
  }, [buildPath, sample, version, smart, revisionId, cvId]);

  async function loadMore() {
    if (loadingMore) return;
    const key = filterKey;
    setLoadingMore(true); setMoreError(false);
    try {
      const page = await apiRequest<Page>(buildPath(smartActive ? nextOffset : items.length));
      if (keyRef.current !== key) return;
      setItems(prev => {
        const seen = new Set(prev.map(i => i.slug));
        const merged = [...prev, ...page.items.filter(i => !seen.has(i.slug))];
        return smartActive ? merged.sort(byMatch) : merged;
      });
      setTotal(page.total); setNextOffset(n => n + POOL_SIZE);
    } catch { if (keyRef.current === key) setMoreError(true); }
    finally { setLoadingMore(false); }
  }

  const visible = useMemo(() => {
    if (!sample) return items;
    const needle = q.toLowerCase();
    return sampleItems.filter(j => (!needle || `${j.title} ${j.company ?? ''} ${j.skills.join(' ')}`.toLowerCase().includes(needle))
      && (!city || j.cities.includes(city)) && (!mode || j.work_mode === mode));
  }, [sample, items, q, city, mode]);
  const shownTotal = sample ? visible.length : total;

  const cities: Facet[] = useMemo(() => {
    const list = sample ? [...new Set(sampleItems.map(j => j.location ?? ''))].map(value => ({ value, count: 0 })) : facetsRes.data?.cities ?? [];
    return city && !list.some(f => f.value === city) ? [{ value: city, count: 0 }, ...list] : list;
  }, [sample, facetsRes.data, city]);
  const categories: Facet[] = useMemo(() => {
    if (sample) return [];
    const top = (facetsRes.data?.categories ?? []).slice(0, 12);
    return category && !top.some(f => f.value === category) ? [{ value: category, count: 0 }, ...top] : top;
  }, [sample, facetsRes.data, category]);
  const grandTotal = sample ? sampleItems.length : facetsRes.data?.total;

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const selected = visible.find(j => j.slug === selectedSlug) ?? (wide ? visible[0] : undefined);

  const catLabel = (slug: string) => c.cats[slug] ?? humanize(slug);
  const detail = (job: JobSearchItem) => <JobDetail job={job} c={c} projectId={projectId} scored={smartActive} />;

  const list = <ul className="grid gap-3 [&>li]:min-w-0">
    {visible.map(job => {
      const isSel = selected?.slug === job.slug;
      return <li key={job.slug}>
        <button type="button" aria-pressed={isSel} aria-current={isSel ? 'true' : undefined} onClick={() => setSelectedSlug(wide || !isSel ? job.slug : null)}
          className={`grid w-full min-w-0 gap-2 rounded-xl border p-4 text-left shadow-sm transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSel ? 'border-primary bg-accent' : 'bg-card'}`}>
          <span className="break-words font-semibold leading-snug">{job.title}</span>
          <span className="break-words text-sm text-muted-foreground">{job.company ?? c.untitled}{job.location ? ` · ${job.location}` : ''}</span>
          <span className="flex flex-wrap gap-2">
            {smartActive && <MatchBadge match={job.match} c={c} />}
            {job.work_mode && <Badge variant="secondary">{(c as unknown as Record<string, string>)[job.work_mode] ?? job.work_mode}</Badge>}
            {job.age_days != null && <Badge variant="outline">{c.age(job.age_days)}</Badge>}
            {job.stale && <Badge variant="warning" className="gap-1"><AlertTriangle className="size-3" aria-hidden="true" />{c.stale}</Badge>}
          </span>
          {job.skills.length > 0 && <span className="flex flex-wrap gap-1.5">{job.skills.slice(0, 4).map(s => <Badge key={s} variant="outline" className="break-words font-normal">{s}</Badge>)}</span>}
        </button>
        {!wide && isSel && <div className="mt-2 rounded-xl border bg-card p-4">{detail(job)}</div>}
      </li>;
    })}
  </ul>;

  const loadingList = <div className="grid gap-3" role="status" aria-live="polite">
    <span className="sr-only">{c.loading}</span>
    {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
  </div>;

  const failed = (!sample && status === 'error') || (smartActive && cvs.status === 'error');
  const waiting = !sample && (status === 'loading' || (smartActive && cvs.status === 'loading'));
  const hasMore = smartActive ? nextOffset < Math.min(total, 1001) : items.length < total;

  return <section className="grid gap-6">
    <PageBack to={`/app/projects/${projectId}/overview`}>{t('nav.overview')}</PageBack>
    <div className="grid gap-1">
      <h1 className="min-w-0 break-words text-2xl font-semibold">{c.title}</h1>
      {grandTotal != null && <p className="text-sm text-muted-foreground">{c.subtitle(number.format(grandTotal))}</p>}
    </div>

    <div role="group" aria-label={c.modeLabel} className="inline-flex w-fit max-w-full rounded-lg border bg-muted p-1">
      {([['search', c.modeSearch], ['match', c.modeMatch]] as const).map(([key, label]) => {
        const on = (key === 'match') === smart;
        return <button key={key} type="button" aria-pressed={on} onClick={() => setSearchMode(key)}
          className={`min-h-11 rounded-md px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>;
      })}
    </div>

    {smartActive && usable.length > 0 && <div className="flex flex-wrap items-end gap-3">
      <div className="grid min-w-0 gap-2 sm:w-72">
        <Label htmlFor="match-cv">{c.cvLabel}</Label>
        <select id="match-cv" className={selectClass} value={cv?.id ?? ''} onChange={e => setCvPick(e.target.value)}>
          {usable.map(item => <option key={item.id} value={item.id}>{item.name} · v{item.latest_revision?.revision}</option>)}
        </select>
      </div>
      {cv?.latest_revision && <CvPreviewButton projectId={projectId} fileId={cv.latest_revision.file_id} name={cv.name} revision={cv.latest_revision.revision} filename={cv.latest_revision.original_filename} mimeType={cv.latest_revision.mime_type} variant="outline" />}
    </div>}

    {sample && <Card className="border-transparent bg-accent text-accent-foreground">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="min-w-0 break-words text-sm"><Badge variant="outline" className="mr-2">{c.sampleBanner}</Badge>{c.sampleBody}</p>
        <Button variant="outline" size="sm" onClick={() => { setSample(false); setSelectedSlug(null); }}>{c.backLive}</Button>
      </CardContent>
    </Card>}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
      <div className="grid min-w-0 gap-2 sm:col-span-2 lg:col-span-1">
        <Label htmlFor="job-search">{c.searchLabel}</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="job-search" type="search" className="pl-9" value={qInput} placeholder={c.searchPlaceholder} onChange={e => setQInput(e.target.value)} />
        </div>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="job-mode">{c.mode}</Label>
        <select id="job-mode" className={selectClass} value={mode} onChange={e => setFilter('work_mode', e.target.value)}>
          <option value="">{c.anyMode}</option>
          {(['remote', 'hybrid', 'onsite'] as const).map(m => <option key={m} value={m}>{c[m]}</option>)}
        </select>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="job-posted">{c.posted}</Label>
        <select id="job-posted" className={selectClass} value={posted} disabled={sample} onChange={e => setFilter('posted_within_days', e.target.value)}>
          <option value="">{c.anyPosted}</option>
          {[7, 14, 30].map(d => <option key={d} value={String(d)}>{c.days(d)}</option>)}
        </select>
      </div>
      {sample && <div className="grid min-w-0 gap-2">
        <Label htmlFor="job-city">{c.city}</Label>
        <select id="job-city" className={selectClass} value={city} onChange={e => setFilter('cities', e.target.value)}>
          <option value="">{c.anyCity}</option>
          {cities.map(f => <option key={f.value} value={f.value}>{f.count ? `${f.value} (${number.format(f.count)})` : f.value}</option>)}
        </select>
      </div>}
    </div>

    {categories.length > 0 && <div role="group" aria-label={c.categories} className="flex flex-wrap gap-2">
      {categories.map(f => <Button key={f.value} type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal rounded-full text-left" aria-pressed={category === f.value}
        onClick={() => setFilter('category', category === f.value ? '' : f.value)}>
        {catLabel(f.value)}{f.count ? <span className="text-muted-foreground">{number.format(f.count)}</span> : null}
      </Button>)}
    </div>}

    {failed ? <Card role="alert"><CardContent className="grid gap-3 p-6">
      <h2 className="break-words font-semibold">{profileFailed ? c.analyzeError : c.errTitle}</h2>
      <p className="text-sm text-muted-foreground">{c.errBody}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => { profiled.current = ''; setVersion(v => v + 1); if (smartActive) cvs.reload(); }}>{c.retry}</Button>
        <Button variant="outline" onClick={() => { setSample(true); setSelectedSlug(null); }}>{c.viewSample}</Button>
      </div>
    </CardContent></Card> : needsCv ? <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6">
      <p className="font-medium">{c.noCv}</p>
      <p className="text-sm text-muted-foreground">{c.noCvBody}</p>
      <Button asChild><Link to={`/app/projects/${projectId}/profile`}>{c.addCv}</Link></Button>
    </div> : <div className="grid gap-3">
      {sample && smart && <p className="text-sm text-muted-foreground">{c.sampleMatch}</p>}
      {(sample || !waiting) && <p role="status" className="text-sm text-muted-foreground">{c.found(number.format(shownTotal))}{smartActive ? ` · ${c.poolNote(number.format(items.length))}` : ''}</p>}
      {profiling ? <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border p-4 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{c.analyzing}</div> : waiting ? loadingList : visible.length === 0 ? <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6">
        <p className="font-medium">{c.none}</p>
        <p className="text-sm text-muted-foreground">{c.noneNext}</p>
        <Button variant="outline" size="sm" onClick={clear} disabled={!filtered}>{c.clear}</Button>
      </div> : <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="grid min-w-0 gap-3 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1">
          {list}
          {!sample && hasMore && <div className="grid justify-items-start gap-2">
            {moreError && <p role="alert" className="text-sm text-destructive">{c.errTitle}</p>}
            <Button variant="outline" disabled={loadingMore} aria-busy={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" />{c.loading}</> : c.loadMore}
            </Button>
          </div>}
        </div>
        {wide && selected && <Card className="sticky top-4 min-w-0 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"><CardContent className="p-6">{detail(selected)}</CardContent></Card>}
      </div>}
    </div>}

    <p className="text-xs text-muted-foreground"><a className="text-primary hover:underline" href="https://freehire.me" target="_blank" rel="noreferrer">{c.credit}</a></p>
  </section>;
}
