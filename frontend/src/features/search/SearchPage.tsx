import { useRunGate } from '@/lib/accountGate';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, Bookmark, BookmarkCheck, Building2, ExternalLink, EyeOff, Info, Loader2, MapPin, RotateCcw, Search, X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { BusyNote } from '@/components/BusyNote';
import { ErrorState } from '../projects/PageStates';
import { Spinner } from '@/components/ui/spinner';
import { SmartMatchStart } from './SmartMatchStart';
import { AgentSteps, BandBadge, MatchBadge, MatchSummary, type T } from './MatchEvidence';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ItemMenu } from '@/components/ItemMenu';
import { apiRequest } from '../../lib/api';
import { ApiError, type CVView } from '../../lib/api-types';
import { CvPreviewButton } from '@/components/CvPreview';
import { NewSessionButton } from '../sessions/NewSessionDialog';
import { safeHttpUrl, sendJson, useResource } from '../projects/useResource';
import { Markdown } from '@/components/Markdown';
import { PageBack } from '@/components/PageBack';
import { sampleJobs } from './sampleJobs';
import { highlightSegments } from './highlight';
import { categoryLabel } from './categories';
import { SavedSearchesPanel } from './SavedSearches';
import { ADV_KEYS, AdvancedFilters, advValueLabel, Presets, splitList, type Facet } from './AdvancedFilters';
import { BuildCvButton } from '../builder/BuildCvButton';
import { CompanyMark } from '@/components/CompanyMark';
import { PageHeader } from '@/components/PageHeader';

export type JobSearchItem = {
  slug: string; title: string; company: string | null; location: string | null; cities: string[];
  work_mode: string | null; skills: string[]; category: string | null; posted_at: string | null;
  age_days: number | null; stale: boolean; ghost_signals?: string[]; source_url: string | null; description_markdown: string;
  salary_min?: number | null; salary_max?: number | null; salary_currency?: string | null; salary_period?: string | null;
  match?: Match | null; ai_match?: AiMatch | null; highlight?: Highlight;
};
export type AiMatch = {
  fit_percent: number; band: 1 | 2 | 3 | 4 | 5; uncertain: boolean; seniority: 'far_below' | 'below' | 'meets' | 'above';
  hard_blocker: boolean; skills_evidenced: string[]; must_missing: string[]; nice_missing: string[];
  evidence?: Record<string, string>; // skill -> the CV line quoting it; absent on unscored rows, {} when no CV text
};
type Highlight = { matched: Record<string, string>; missing: Record<string, string> };
type AiState = { status: 'ready' | 'partial' | 'missing' | 'unavailable'; categories: string[] | null; scored: number };
type HiddenItem = { id: string; kind: 'job' | 'company'; label: string; created_at?: string };
export type Match = { score_percent: number; matched: string[]; missing: string[]; required_count: number };
type Facets = { total: number; categories: Facet[]; cities: Facet[]; seniority?: Facet[]; employment_type?: Facet[]; company_type?: Facet[]; skills?: Facet[]; thai_postings?: number; new_7d?: number };
type Page = { items: JobSearchItem[]; total: number; limit?: number; pool?: number; offset: number; ai?: AiState; hidden_count?: number };

const PAGE_SIZE = 20;
const POOL_SIZE = 100;
// Best match first, then newest; postings with too few recognisable skills (match null) go last.
const byMatch = (a: JobSearchItem, b: JobSearchItem) =>
  Number(!a.ai_match) - Number(!b.ai_match) || (b.ai_match?.fit_percent ?? 0) - (a.ai_match?.fit_percent ?? 0) || Number(!a.match) - Number(!b.match) || (b.match?.score_percent ?? 0) - (a.match?.score_percent ?? 0) || (a.age_days ?? 1e6) - (b.age_days ?? 1e6);
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
});
const RUN_DONE = ['completed', 'failed', 'cancelled', 'interrupted'];
const FILTER_KEYS = ['q', 'cities', 'work_mode', 'posted_within_days', 'category', ...ADV_KEYS] as const;

const copy = {
  th: {
    title: 'ค้นหางาน', subtitle: (n: string) => `งานในประเทศไทย ${n} ตำแหน่ง`, stats: (t: string, n: string, th: string) => `งานในไทย ${t} · ใหม่ 7 วัน ${n} · ประกาศภาษาไทย ${th}`,
    thaiHint: (n?: number, t?: number) => `ประกาศส่วนใหญ่เป็นภาษาอังกฤษ${n != null && t != null ? ` (ภาษาไทย ${n} จาก ${t} รายการ)` : ''} คำค้นภาษาไทยพบเฉพาะประกาศภาษาไทยและชื่อตำแหน่งที่ระบบรู้จัก ลองค้นเป็นภาษาอังกฤษด้วย เช่น “Data Analyst”`,
    searchLabel: 'ค้นหาตำแหน่ง บริษัท หรือทักษะ', searchPlaceholder: 'เช่น Frontend, Data analyst หรือชื่อบริษัท',
    mode: 'รูปแบบการทำงาน', anyMode: 'ทุกแบบ', posted: 'ช่วงเวลาที่ลงประกาศ', anyPosted: 'ทุกช่วง',
    days: (n: number) => `${n} วันที่ผ่านมา`, city: 'จังหวัด/เมือง', anyCity: 'ทุกเมือง', categories: 'หมวดงาน',
    remote: 'ทำงานทางไกล', hybrid: 'ไฮบริด', onsite: 'ทำงานที่ออฟฟิศ',
    found: (n: string) => `พบ ${n} ตำแหน่ง`, age: (n: number) => (n <= 0 ? 'ลงประกาศวันนี้' : `ลงประกาศ ${n} วันที่แล้ว`),
    stale: 'ประกาศเก่า · อาจปิดรับแล้ว',
    ghost: { old: (n: number) => `ลงประกาศมา ${n} วันแล้ว`, source_flagged: 'แหล่งงานระบุว่าประกาศนี้อาจไม่เป็นปัจจุบัน', unlisted: 'ไม่พบประกาศนี้ในแหล่งงานตอนตรวจครั้งล่าสุด' }, evaluate: 'ประเมินงานนี้', save: 'บันทึกงาน', saveShort: 'บันทึก', saved: 'บันทึกแล้ว', saving: 'กำลังบันทึก…',
    original: 'เปิดประกาศต้นฉบับ', saveError: 'บันทึกงานไม่สำเร็จ ลองอีกครั้ง', loadMore: 'โหลดเพิ่ม', capNote: 'แสดงสูงสุด 1,000 รายการแรก ใช้คำค้นหรือตัวกรองเพื่อจำกัดผลให้แคบลง', loading: 'กำลังโหลด…',
    none: 'ไม่พบตำแหน่งที่ตรงกับตัวกรอง', noneNext: 'ลองเปลี่ยนคำค้นหาหรือล้างตัวกรองเพื่อดูทั้งหมด', clear: 'ล้างตัวกรอง',
    errTitle: 'โหลดรายการงานไม่สำเร็จ', errBody: 'บริการอาจไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง หรือดูข้อมูลตัวอย่างเพื่อสำรวจหน้านี้',
    retry: 'ลองอีกครั้ง', viewSample: 'ดูข้อมูลตัวอย่าง', backLive: 'กลับไปข้อมูลจริง',
    sampleBanner: 'ข้อมูลตัวอย่าง', sampleBody: 'ข้อมูลทั้งหมดในมุมมองนี้เป็นข้อมูลสมมติ ไม่ใช่ประกาศงานจริง',
    description: 'รายละเอียดงาน', untitled: 'ไม่ระบุบริษัท',
    modeSearch: 'ค้นหาทั่วไป', modeMatch: 'Smart match', modeLabel: 'โหมดการค้นหา',
    cvLabel: 'CV ที่ใช้จับคู่', noCv: 'ยังไม่มี CV ในโปรเจกต์นี้', noCvBody: 'เพิ่ม CV ก่อน เพื่อให้ระบบเทียบทักษะกับประกาศงานได้', addCv: 'ไปที่หน้า CV',
    analyzeError: 'วิเคราะห์ CV ไม่สำเร็จ ลองอีกครั้ง',
    poolNote: (n: string) => `จัดอันดับจาก ${n} ตำแหน่งล่าสุดที่ตรงกับตัวกรอง`,
    matchBadge: (p: number, m: number, n: number) => `ตรงกับ CV ${p}% · ${m}/${n} ทักษะ`, noSkills: 'ข้อมูลทักษะไม่พอ',
    matchedSkills: 'ทักษะที่ตรงกับ CV', missingSkills: 'ทักษะที่ยังขาด', noneMatched: 'ไม่มี', matchNote: 'คำนวณจากคำสำคัญในประกาศและ CV โดยไม่ใช้ AI',
    sampleSave: 'ข้อมูลตัวอย่างบันทึกหรือประเมินไม่ได้ ใช้ได้กับประกาศงานจริงเท่านั้น', sampleMatch: 'Smart match ใช้กับข้อมูลตัวอย่างไม่ได้ จึงแสดงรายการโดยไม่มีคะแนน', loadMorePool: 'โหลดเพิ่ม',
    bands: { 5: 'เหมาะมาก', 4: 'เหมาะ', 3: 'พอได้', 2: 'น้อย', 1: 'ไม่เหมาะ' } as Record<number, string>, ats: (p: number) => `ทักษะที่พบ ${p}%`,
    unsure: 'ไม่แน่ใจ', blocker: 'ขาดคุณสมบัติบังคับ', seniorityLabel: 'ระดับประสบการณ์', seniority: { far_below: 'ต่ำกว่ามาก', below: 'ต่ำกว่าเล็กน้อย', meets: 'ตรง', above: 'สูงกว่า' } as Record<string, string>,
    evidenced: 'มีหลักฐานใน CV', mustMissing: 'ขาด (บังคับ)', niceMissing: 'ขาด (มีก็ดี)', inCv: '(มีใน CV)', notInCv: '(ขาด)',
    agentWorking: 'เอเจนต์กำลังประมวลผล', steps: { read: 'กำลังอ่าน CV ของคุณ', shortlist: 'กำลังคัดงานที่น่าสนใจ', score: (n: number, t: number) => (t ? `กำลังให้คะแนนงาน ${n} จาก ${t}` : 'กำลังให้คะแนนงาน') }, tailorCv: 'ปรับ CV ให้ตรงงานนี้', tailorCvFor: (s: string) => `ปรับ CV ให้ตรงงานนี้ เรื่อง ${s}`, quoteFrom: 'ข้อความจาก CV ของคุณ', rankFailed: 'จัดอันดับด้วย AI ไม่สำเร็จ',
    autoCats: 'หมวดที่ AI เลือกจาก CV:', unavailable: 'ตอนนี้ยังจัดอันดับด้วย AI ไม่ได้ โปรดติดต่อผู้ดูแลระบบ', toSettings: 'ไปที่การตั้งค่า',
    privacy: 'ระบบส่งเนื้อหา CV ไปยังบริการ AI เพื่อจัดอันดับ', menuLabel: 'ตัวเลือกของงานนี้', hideJob: 'ซ่อนงานนี้', hideCompany: 'ซ่อนบริษัทนี้',
    hiddenDone: 'ซ่อนแล้ว', undo: 'เลิกทำ', hideFailed: 'ซ่อนไม่สำเร็จ ลองอีกครั้ง', undoFailed: 'กู้คืนไม่สำเร็จ ลองอีกครั้ง',
    hiddenLink: (n: number) => `ที่ซ่อนไว้ (${n})`, hiddenTitle: 'งานและบริษัทที่ซ่อนไว้', hiddenEmpty: 'ไม่มีรายการที่ซ่อนไว้', kindWord: { job: 'งาน', company: 'บริษัท' } as Record<string, string>, unhide: 'เลิกซ่อน',
  },
  en: {
    title: 'Job search', subtitle: (n: string) => `${n} jobs in Thailand`, stats: (t: string, n: string, th: string) => `Jobs in Thailand ${t} · New in 7 days ${n} · Thai postings ${th}`,
    thaiHint: (n?: number, t?: number) => `Most postings are in English${n != null && t != null ? ` (${n} of ${t} in Thai)` : ''}. A Thai search finds Thai postings and job titles the platform knows; also try English, e.g. “Data Analyst”.`,
    searchLabel: 'Search title, company or skill', searchPlaceholder: 'e.g. Frontend, Data analyst or a company',
    mode: 'Work mode', anyMode: 'Any', posted: 'Posted within', anyPosted: 'Any time',
    days: (n: number) => `${n} days`, city: 'City', anyCity: 'All cities', categories: 'Categories',
    remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site',
    found: (n: string) => `${n} ${n === '1' ? 'job' : 'jobs'} found`, age: (n: number) => (n <= 0 ? 'Posted today' : `${n} ${n === 1 ? 'day' : 'days'} ago`),
    stale: 'Stale listing',
    ghost: { old: (n: number) => `Posted ${n} days ago`, source_flagged: 'The source marks this listing as possibly out of date', unlisted: 'Not found on the source at the last check' }, evaluate: 'Evaluate this job', save: 'Save job', saveShort: 'Save', saved: 'Saved', saving: 'Saving…',
    original: 'Open original posting', saveError: 'Could not save this job. Try again.', loadMore: 'Load more', capNote: 'Showing the first 1,000 results. Use a keyword or filters to narrow them down.', loading: 'Loading…',
    none: 'No jobs match these filters', noneNext: 'Change the search or clear the filters to see everything.', clear: 'Clear filters',
    errTitle: "Couldn't load jobs", errBody: 'The service may be temporarily unavailable. Try again, or view sample data to explore this page.',
    retry: 'Retry', viewSample: 'View sample data', backLive: 'Back to live data',
    sampleBanner: 'Sample', sampleBody: 'Everything in this view is fictional sample data, not real postings.',
    description: 'Job description', untitled: 'Company not listed',
    modeSearch: 'Search', modeMatch: 'Smart match', modeLabel: 'Search mode',
    cvLabel: 'CV to match against', noCv: 'This project has no CV yet', noCvBody: 'Add a CV first so skills can be compared with each posting.', addCv: 'Go to the CV page',
    analyzeError: 'Could not analyze the CV. Try again.',
    poolNote: (n: string) => `Ranked from the ${n} latest jobs matching your filters`,
    matchBadge: (p: number, m: number, n: number) => `${p}% CV match · ${m}/${n} skills`, noSkills: 'Not enough skill data',
    matchedSkills: 'Skills matching your CV', missingSkills: 'Skills missing from your CV', noneMatched: 'None', matchNote: 'Calculated from keywords in the posting and your CV, without AI',
    sampleSave: 'Sample data cannot be saved or evaluated. This works on real postings only.', sampleMatch: 'Smart match does not work on sample data, so jobs are shown without scores', loadMorePool: 'Load more',
    bands: { 5: 'Great fit', 4: 'Good fit', 3: 'Fair', 2: 'Weak', 1: 'Poor fit' } as Record<number, string>, ats: (p: number) => `Skills found ${p}%`,
    unsure: 'Unsure', blocker: 'Missing a must-have', seniorityLabel: 'Seniority', seniority: { far_below: 'Well below', below: 'Slightly below', meets: 'Meets', above: 'Above' } as Record<string, string>,
    evidenced: 'Evidenced in your CV', mustMissing: 'Missing (must-have)', niceMissing: 'Missing (nice-to-have)', inCv: '(in your CV)', notInCv: '(missing)',
    agentWorking: 'The agent is working', steps: { read: 'Reading your CV', shortlist: 'Shortlisting jobs', score: (n: number, t: number) => (t ? `Scoring jobs ${n} of ${t}` : 'Scoring jobs') }, tailorCv: 'Tailor CV for this job', tailorCvFor: (s: string) => `Tailor CV for this job, about ${s}`, quoteFrom: 'Quoted from your CV', rankFailed: 'AI ranking failed',
    autoCats: 'Categories picked from the CV:', unavailable: 'AI ranking is not available right now. Please contact your administrator.', toSettings: 'Open settings',
    privacy: 'Your CV text is sent to an AI service for ranking', menuLabel: 'Options for this job', hideJob: 'Hide this job', hideCompany: 'Hide this company',
    hiddenDone: 'Hidden', undo: 'Undo', hideFailed: 'Could not hide. Try again.', undoFailed: 'Could not restore. Try again.',
    hiddenLink: (n: number) => `Hidden (${n})`, hiddenTitle: 'Hidden jobs and companies', hiddenEmpty: 'Nothing is hidden', kindWord: { job: 'Job', company: 'Company' } as Record<string, string>, unhide: 'Unhide',
  },
};
export type Copy = typeof copy.th;


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


type SavedJob = { id: string; title: string; company?: string | null; source_url?: string | null };

// One saved-jobs lookup for the whole page; a posting already saved (same link, or same title and company) links to its saved copy instead of saving twice.
function useSavedJobs(projectId: string) {
  const saved = useResource<SavedJob[]>(`/projects/${projectId}/jobs`);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ slug: string; card: boolean } | null>(null);
  const find = (job: JobSearchItem) => {
    const source = safeHttpUrl(job.source_url);
    return (saved.data ?? []).find(item => (source && item.source_url === source) || (item.title === job.title && (item.company ?? '') === (job.company ?? '')));
  };
  async function save(job: JobSearchItem, card: boolean) {
    if (busy) return;
    setBusy(job.slug); setFailed(null);
    try {
      await sendJson(`/projects/${projectId}/jobs`, 'POST', { title: job.title.slice(0, 300), company: job.company?.slice(0, 300) || null, source_url: safeHttpUrl(job.source_url) ?? null, description: job.description_markdown.slice(0, 50000) || job.title });
      saved.reload();
    } catch { setFailed({ slug: job.slug, card }); }
    setBusy(null);
  }
  return { loading: saved.status === 'loading', find, busy, failed, save };
}
type SavedJobs = ReturnType<typeof useSavedJobs>;

function SaveJob({ job, c, projectId, saves, tSearch, card = false }: { job: JobSearchItem; c: Copy; projectId: string; saves: SavedJobs; tSearch: T; card?: boolean }) {
  const existing = saves.find(job);
  const saving = saves.busy === job.slug;
  if (existing) return card
    ? <span className="inline-flex min-h-11 lg:min-h-10 items-center gap-1 rounded-md bg-muted px-3 text-sm text-muted-foreground"><BookmarkCheck className="size-4 text-primary" aria-hidden="true" />{c.saved}</span>
    : <Button asChild variant="outline" className="h-auto whitespace-normal text-left"><Link to={`/app/projects/${projectId}/jobs/${existing.id}`}><BookmarkCheck className="size-4 text-primary" aria-hidden="true" />{c.saved}</Link></Button>;
  const checkingId = `save-job-status-${job.slug}${card ? '-card' : ''}`;
  return <>
    {!card && saves.loading && <p id={checkingId} role="status" className="text-xs text-muted-foreground">{tSearch('controls.checkingSavedJob')}</p>}
    <Button type="button" variant={card ? 'ghost' : 'outline'} size={card ? 'icon-sm' : 'default'} className={card ? 'text-muted-foreground hover:text-foreground' : 'h-auto whitespace-normal text-left'}
      aria-describedby={card ? `job-title-${job.slug}` : saves.loading ? checkingId : undefined}
      disabled={Boolean(saves.busy) || saves.loading} onClick={() => void saves.save(job, card)}>
      {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}{card ? <span className="sr-only">{saving ? c.saving : c.saveShort}</span> : saving ? c.saving : c.save}
    </Button>
    {saves.failed?.slug === job.slug && saves.failed.card === card && <Alert severity="error" className="basis-full">{c.saveError}</Alert>}
  </>;
}

function JobDetail({ place: placeText, job, c, projectId, scored, tSearch, cv, saves, ranking, sample = false }: { sample?: boolean; job: JobSearchItem; c: Copy; projectId: string; scored: boolean; place: string | null; tSearch: T; cv?: { name: string; revision: number }; saves: SavedJobs; ranking: boolean }) {
  const source = safeHttpUrl(job.source_url);
  const modeLabel = job.work_mode ? (c as unknown as Record<string, string>)[job.work_mode] ?? job.work_mode : null;
  const cvLabel = cv ? `${cv.name} · v${cv.revision}` : null;
  return <div className="grid gap-4">
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
      <CompanyMark name={job.company} size={48} />
      <div className="min-w-0">
      <h2 className="break-words text-xl leading-snug">{job.title}</h2>
      <p className="mt-1 flex items-start gap-1 break-words text-sm text-muted-foreground"><Building2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="min-w-0">{job.company ?? c.untitled}</span></p>
      {placeText && <p className="flex items-start gap-1 break-words text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="min-w-0">{placeText}{modeLabel ? ` · ${modeLabel}` : ''}</span></p>}
      </div>
    </div>
    <div className="grid gap-2">
      {sample ? <p className="text-sm text-muted-foreground">{c.sampleSave}</p> : <>
      <NewSessionButton projectId={projectId} cvName={cv?.name} className="h-auto w-full whitespace-normal text-center" job={{ inline: { title: job.title, company: job.company, description: job.description_markdown.slice(0, 50000), source_url: source } }}>
        {cvLabel ? tSearch('controls.evaluateWith', { cv: cvLabel }) : c.evaluate}
      </NewSessionButton>
      {cvLabel && <p className="text-xs text-muted-foreground">{tSearch('controls.evalNote', { cv: cvLabel })}</p>}
      </>}
      <div className="flex flex-wrap items-center gap-2">
        {!sample && <SaveJob key={job.slug} job={job} c={c} projectId={projectId} saves={saves} tSearch={tSearch} />}
        {source && <Button asChild variant="link" className="h-auto min-h-11 whitespace-normal text-left">
          <a href={source} target="_blank" rel="noreferrer">{c.original}<ExternalLink className="size-4" aria-hidden="true" /></a>
        </Button>}
      </div>
    </div>
    {scored && <MatchSummary job={job} c={c} tSearch={tSearch} ranking={ranking} projectId={projectId} cv={cv} />}
    <div className="flex flex-wrap gap-2">
      {job.age_days != null && <Badge variant="outline">{c.age(job.age_days)}</Badge>}
      {job.stale && <Badge variant="warning">{c.stale}</Badge>}
      {job.skills.map(s => <Badge key={s} variant="outline" className="break-words">{s}</Badge>)}
    </div>
    {job.stale && (job.ghost_signals?.length ?? 0) > 0 && <ul className="grid gap-1 text-sm text-muted-foreground" data-testid="ghost-reasons">
      {job.ghost_signals!.map(code => <li key={code} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <span>{code === 'old' ? c.ghost.old(job.age_days ?? 0) : code === 'source_flagged' ? c.ghost.source_flagged : code === 'unlisted' ? c.ghost.unlisted : code}</span></li>)}
    </ul>}
    <div className="grid gap-2 border-t pt-4">
      <h3 className="text-sm font-semibold">{c.description}</h3>
      {job.highlight && (Object.keys(job.highlight.matched).length || Object.keys(job.highlight.missing).length)
        ? <div className="grid gap-3 break-words text-sm leading-relaxed">{job.description_markdown.split(/\n{2,}/).map((para, i) => <p key={i} className="whitespace-pre-wrap">
          {highlightSegments(para, job.highlight!).map((seg, j) => seg.kind === 'plain' ? seg.text
            : <mark key={j} className={seg.kind === 'matched' ? 'rounded bg-success/15 px-0.5 text-success' : 'rounded bg-destructive/12 px-0.5 text-destructive'}>{seg.text}<span className="sr-only"> {seg.kind === 'matched' ? c.inCv : c.notInCv}</span></mark>)}
        </p>)}</div>
        : <Markdown className="text-sm">{job.description_markdown}</Markdown>}
    </div>
  </div>;
}

export function SearchPage() {
  const { t, i18n } = useTranslation();
  const { t: tSearch } = useTranslation('searchWorkspace');
  const locale: 'th' | 'en' = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const number = useMemo(() => new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US'), [locale]);
  const { projectId = '' } = useParams();
  const wide = useWide();
  const [params, setParams] = useSearchParams();
  const selectionScroll = useRef(0);
  const detailBack = useRef<HTMLButtonElement>(null);

  const q = params.get('q') ?? '';
  const city = params.get('cities') ?? '';
  const mode = params.get('work_mode') ?? '';
  const posted = params.get('posted_within_days') ?? '';
  const category = params.get('category') ?? '';
  const advKey = ADV_KEYS.map(k => params.get(k) ?? '').join('|');
  const filtered = Boolean(q || city || mode || posted || category || advKey.replace(/\|/g, ''));
  const get = (k: string) => params.get(k) ?? '';
  const smart = params.get('mode') === 'match';
  const setSearchMode = (next: 'search' | 'match') => setParams(prev => {
    const out = new URLSearchParams(prev);
    if (next === 'match') out.set('mode', 'match'); else out.delete('mode');
    return out;
  }, { replace: true });

  const setMany = useCallback((changes: Record<string, string>) => {
    setParams(prev => { const next = new URLSearchParams(prev); for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); } return next; }, { replace: true });
  }, [setParams]);
  const setFilter = useCallback((key: typeof FILTER_KEYS[number], value: string) => setMany({ [key]: value }), [setMany]);
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
  // Smart match calls the AI, so each CV revision must be started by the user; changing the CV asks again.
  const [armedFor, setArmedFor] = useState('');
  const awaiting = smartActive && usable.length > 0 && armedFor !== revisionId;
  const [profiling, setProfiling] = useState(false);
  const [profileFailed, setProfileFailed] = useState(false);
  const profiled = useRef('');
  const [nextOffset, setNextOffset] = useState(POOL_SIZE);

  const filterKey = useMemo(() => new URLSearchParams({ q, cities: city, work_mode: mode, posted_within_days: posted, category, adv: advKey, smart: smartActive ? revisionId : '' }).toString(), [q, city, mode, posted, category, advKey, smartActive, revisionId]);
  const [items, setItems] = useState<JobSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [poolCount, setPoolCount] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [version, setVersion] = useState(0);
  const [ai, setAi] = useState<AiState | null>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const gate = useRunGate();
  const gateBlocked = gate.blocked;
  const [ranking, setRanking] = useState(false);
  const [rankFailed, setRankFailed] = useState(false);
  const [undo, setUndo] = useState<{ id: string; message: string; retry: boolean } | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [dialogError, setDialogError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const hiddenRes = useResource<{ items: HiddenItem[] }>(hiddenOpen ? `/projects/${projectId}/job-search/hidden` : null);
  const keyRef = useRef(filterKey);
  keyRef.current = filterKey;

  const buildPath = useCallback((offset: number) => {
    const search = new URLSearchParams();
    if (smartActive) { search.set('cv_revision_id', revisionId); search.set('pool', String(POOL_SIZE)); }
    if (q) search.set('q', q);
    if (mode) search.set('work_mode', mode);
    if (posted) search.set('posted_within_days', posted);
    if (category) search.set('category', category);
    if (city) search.set('cities', city);
    ADV_KEYS.forEach((key, i) => { const v = advKey.split('|')[i]; if (v) search.set(key, v); });
    if (!smartActive) search.set('limit', String(PAGE_SIZE));
    search.set('offset', String(offset));
    return `/projects/${projectId}/job-search${smartActive ? '/match' : ''}?${search.toString()}`;
  }, [projectId, q, city, mode, posted, category, advKey, smartActive, revisionId]);

  // Extracts the CV's skill names in the sandbox (no AI), then waits for the run to finish.
  async function profileCv(id: string, signal: AbortSignal) {
    const first = await apiRequest<{ status?: string; id?: string }>(`/async/projects/${projectId}/cvs/${id}/skill-profiles`, { method: 'POST', signal });
    if (first.status === 'ready' || !first.id) return;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(1500, signal);
      const run = await apiRequest<{ status: string }>(`/projects/${projectId}/runs/${first.id}`, { signal });
      if (run.status === 'completed') return;
      if (['failed', 'cancelled', 'interrupted'].includes(run.status)) throw new Error('profile_failed');
    }
    throw new Error('profile_timeout');
  }

  // Starts the AI scoring run, then polls the list and run until it ends (or ~3 minutes).
  async function rankJobs(signal: AbortSignal) {
    setRanking(true);
    try {
      const run = await apiRequest<{ id: string }>(`/async/projects/${projectId}/smart-matches`, { method: 'POST', signal, body: JSON.stringify({
        cv_revision_id: revisionId, q, cities: city ? [city] : [], work_mode: mode || null, posted_within_days: posted ? Number(posted) : null, category: category || null,
        seniority: splitList(get('seniority')), employment_type: splitList(get('employment_type')), company_type: splitList(get('company_type')), skills: splitList(get('skills')),
        posting_language: get('posting_language') || null, salary_min: get('salary_min') ? Number(get('salary_min')) : null, pool: POOL_SIZE, offset: 0 }) });
      let finished = false;
      for (let attempt = 0; attempt < 90 && !finished; attempt += 1) {
        await sleep(2000, signal);
        const [page, state] = await Promise.all([apiRequest<Page>(buildPath(0), { signal }), apiRequest<{ status: string }>(`/projects/${projectId}/runs/${run.id}`, { signal })]);
        setItems(page.items); setTotal(page.total); setPoolCount(page.pool ?? page.items.length); setAi(page.ai ?? null); setHiddenCount(page.hidden_count ?? 0);
        if (RUN_DONE.includes(state.status)) {
          finished = true;
          if (state.status !== 'completed') setRankFailed(true);
          const last = await apiRequest<Page>(buildPath(0), { signal }); // the run may have ended after the page fetch above
          setItems(last.items); setTotal(last.total); setPoolCount(last.pool ?? last.items.length); setAi(last.ai ?? null); setHiddenCount(last.hidden_count ?? 0);
        }
      }
      if (!finished) setRankFailed(true);
      setRanking(false);
    } catch (error) {
      if (signal.aborted) return;
      setRanking(false);
      if (error instanceof ApiError && error.code === 'jev_unavailable') setAi(prev => (prev ? { ...prev, status: 'unavailable' } : prev)); else setRankFailed(true);
    }
  }

  useEffect(() => {
    if (sample) return;
    setStatus('loading'); setItems([]); setTotal(0); setPoolCount(0); setAi(null); setRanking(false); setRankFailed(false); setMoreError(false); setProfiling(false); setProfileFailed(false); setNextOffset(POOL_SIZE);
    if (smart && !revisionId) return;
    if (smart && armedFor !== revisionId) { setStatus('ready'); return; }
    const controller = new AbortController();
    apiRequest<Page>(buildPath(0), { signal: controller.signal })
      .then(page => {
        if (controller.signal.aborted) return;
        setItems(page.items); setTotal(page.total); setPoolCount(page.pool ?? page.items.length); setStatus('ready'); setAi(page.ai ?? null); setHiddenCount(page.hidden_count ?? 0);
        if (smart && !gateBlocked && (page.ai?.status === 'missing' || page.ai?.status === 'partial')) void rankJobs(controller.signal);
      })
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
  }, [buildPath, sample, version, smart, revisionId, cvId, gateBlocked, armedFor]);

  const hideTimer = useRef(0);
  useEffect(() => {
    if (!undo) return;
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUndo(null), 8000);
    return () => window.clearTimeout(hideTimer.current);
  }, [undo]);
  async function hide(job: JobSearchItem, kind: 'job' | 'company') {
    const value = kind === 'job' ? job.slug : job.company;
    if (!value) return;
    try {
      const row = await sendJson<HiddenItem>(`/projects/${projectId}/job-search/hidden`, 'POST', { kind, value: value.slice(0, 300), label: (kind === 'job' ? job.title : value).slice(0, 300) });
      setItems(prev => prev.filter(i => (kind === 'job' ? i.slug !== job.slug : i.company !== job.company)));
      setHiddenCount(n => n + 1); setUndo({ id: row.id, message: c.hiddenDone, retry: true });
    } catch { setUndo({ id: '', message: c.hideFailed, retry: false }); }
  }
  async function unhide(id: string, fromDialog = false) {
    if (fromDialog) { if (busyId) return; setBusyId(id); setDialogError(false); }
    try {
      await apiRequest(`/projects/${projectId}/job-search/hidden/${id}`, { method: 'DELETE' });
      setUndo(null); setVersion(v => v + 1); if (fromDialog) hiddenRes.reload();
    } catch { if (fromDialog) setDialogError(true); else setUndo({ id, message: c.undoFailed, retry: false }); }
    finally { if (fromDialog) setBusyId(null); }
  }

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
      setTotal(page.total); setPoolCount(page.pool ?? page.items.length); setNextOffset(n => n + POOL_SIZE);
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
  // Provinces come from the server with both names; show the one for the app language (the URL keeps the English name).
  const provinceName = (f: Facet) => (locale === 'th' && f.name_th) || f.value;
  const categories: Facet[] = useMemo(() => {
    if (sample) return [];
    const top = (facetsRes.data?.categories ?? []).slice(0, 12);
    return category && !top.some(f => f.value === category) ? [{ value: category, count: 0 }, ...top] : top;
  }, [sample, facetsRes.data, category]);
  const thaiHintLine = !sample && /[\u0E00-\u0E7F]/.test(q)
    ? <p data-testid="thai-search-hint" className="text-sm text-muted-foreground">{c.thaiHint(facetsRes.data?.thai_postings, facetsRes.data?.total)}</p> : null;
  const grandTotal = sample ? sampleItems.length : facetsRes.data?.total;

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  useEffect(() => {
    setSelectedSlug(null);
    selectionScroll.current = 0;
  }, [filterKey, projectId]);
  const selected = visible.find(j => j.slug === selectedSlug) ?? (wide ? visible[0] : undefined);

  const catLabel = (slug: string) => categoryLabel(locale, slug);
  // Thai app: a posting listed in Thai provinces shows their Thai names; anything else keeps the source text.
  const provinceTh = useMemo(() => new Map((facetsRes.data?.cities ?? []).map(f => [f.value, f.name_th ?? f.value])), [facetsRes.data]);
  const placeOf = (job: JobSearchItem) => { const names = locale === 'th' ? (job.cities ?? []).map(v => provinceTh.get(v)).filter(Boolean) : []; return names.length ? names.join(', ') : job.location; };
  const saves = useSavedJobs(projectId);
  const detailCv = cv?.latest_revision ? { name: cv.name, revision: cv.latest_revision.revision } : undefined;
  const detail = (job: JobSearchItem) => <JobDetail job={job} place={placeOf(job)} c={c} projectId={projectId} scored={smartActive} tSearch={tSearch} cv={smartActive ? detailCv : undefined} saves={saves} ranking={ranking} sample={sample} />;

  const activeFilterChips: { key: string; label: string }[] = [];
  if (q) activeFilterChips.push({ key: 'q', label: tSearch('controls.queryValue', { value: q }) });
  if (city) activeFilterChips.push({ key: 'cities', label: tSearch('controls.filterValue', { name: tSearch('controls.location'), value: provinceName(cities.find(f => f.value === city) ?? { value: city, count: 0 }) }) });
  if (mode) activeFilterChips.push({ key: 'work_mode', label: tSearch('controls.filterValue', { name: c.mode, value: mode === 'remote' ? c.remote : mode === 'hybrid' ? c.hybrid : mode === 'onsite' ? c.onsite : mode }) });
  if (posted) activeFilterChips.push({ key: 'posted_within_days', label: tSearch('controls.postedValue', { days: posted }) });
  if (category) activeFilterChips.push({ key: 'category', label: tSearch('controls.filterValue', { name: c.categories, value: catLabel(category) }) });
  const advNames: Record<string, string> = { seniority: tSearch('controls.seniority'), employment_type: tSearch('controls.employmentType'), company_type: tSearch('controls.companyType'), skills: tSearch('controls.skills'), posting_language: tSearch('controls.postingLanguage'), salary_min: tSearch('controls.minimumSalary') };
  ADV_KEYS.forEach(key => {
    const value = get(key);
    if (!value) return;
    const multi = ['skills', 'seniority', 'employment_type', 'company_type'].includes(key);
    const values = multi ? splitList(value) : [value];
    values.forEach(item => {
      const display = advValueLabel(locale, key, item);
      activeFilterChips.push({ key: multi ? `${key}:${item}` : key, label: tSearch('controls.filterValue', { name: advNames[key], value: display }) });
    });
  });
  const showMobileDetail = !wide && Boolean(selectedSlug && selected);
  useEffect(() => { if (showMobileDetail) detailBack.current?.focus(); }, [showMobileDetail, selectedSlug]);
  const removeFilter = (key: string) => {
    const separator = key.indexOf(':');
    if (separator > 0) {
      const filterKey = key.slice(0, separator);
      const value = key.slice(separator + 1);
      setMany({ [filterKey]: splitList(get(filterKey)).filter(item => item !== value).join(',') });
    } else {
      if (key === 'q') setQInput('');
      setMany({ [key]: '' });
    }
  };

  const list = <ul aria-label={tSearch('controls.resultsLabel')} className="grid gap-3 [&>li]:min-w-0">
    {visible.map(job => {
      const isSel = selected?.slug === job.slug;
      const ai = job.ai_match;
      const salary = job.salary_min != null || job.salary_max != null
        ? [job.salary_min != null ? number.format(job.salary_min) : null, job.salary_max != null ? number.format(job.salary_max) : null].filter(Boolean).join('–')
          + (job.salary_currency ? ` ${job.salary_currency}` : '') + (job.salary_period ? `/${job.salary_period}` : '')
        : null;
      const modeLabel = job.work_mode ? (c as unknown as Record<string, string>)[job.work_mode] ?? job.work_mode : null;
      const meta = [placeOf(job), modeLabel, job.age_days != null ? c.age(job.age_days) : null, salary].filter(Boolean) as string[];
      return <li key={job.slug} className={`relative grid min-w-0 gap-2 rounded-xl border bg-card p-4 pe-12 transition-colors hover:bg-accent/60 [&:has([data-job-slug]:focus-visible)]:ring-2 [&:has([data-job-slug]:focus-visible)]:ring-ring ${isSel ? 'border-primary bg-accent shadow-[inset_3px_0_0_var(--primary)]' : ''}`}>
        <button type="button" aria-pressed={isSel} aria-current={isSel ? 'true' : undefined} onClick={() => {
          if (!wide) selectionScroll.current = window.scrollY;
          setSelectedSlug(wide || !isSel ? job.slug : null);
        }} data-job-slug={job.slug}
          className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 text-left focus-visible:outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']">
          <CompanyMark name={job.company} size={40} />
          <span className="grid min-w-0 gap-2">
          <span id={`job-title-${job.slug}`} className="line-clamp-2 break-words text-base font-semibold leading-snug">{job.title}</span>
          <span className="break-words text-sm text-muted-foreground">{job.company ?? c.untitled}</span>
          {meta.length > 0 && <span className="flex items-start gap-1 break-words text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="min-w-0">{meta.join(' · ')}</span></span>}
          {job.skills.length > 0 && <span className="flex flex-wrap gap-1">{job.skills.slice(0, 3).map(s => <Badge key={s} variant="muted" className="break-words font-normal">{s}</Badge>)}</span>}
          {(smartActive || ai?.uncertain || job.stale) && <span className="flex flex-wrap gap-2">
            {smartActive && ai && <BandBadge ai={ai} c={c} aiLabel={tSearch('controls.aiFit')} />}
            {smartActive && <MatchBadge match={job.match} c={c} />}
            {ai?.uncertain && <Badge variant="outline">{c.unsure}</Badge>}
            {ai?.hard_blocker && <Badge variant="warning" className="gap-1"><AlertTriangle className="size-3" aria-hidden="true" />{c.blocker}</Badge>}
            {job.stale && <Badge variant="warning" className="gap-1"><AlertTriangle className="size-3" aria-hidden="true" />{c.stale}</Badge>}
          </span>}
          </span>
        </button>
        {!sample && <div className="absolute bottom-2 end-2 z-10 flex flex-wrap justify-end"><SaveJob job={job} c={c} projectId={projectId} saves={saves} tSearch={tSearch} card /></div>}
        {smartActive && <ItemMenu label={c.menuLabel} className="absolute right-2 top-2 z-10" actions={[
          { label: c.hideJob, icon: <EyeOff className="size-4" aria-hidden="true" />, onSelect: () => void hide(job, 'job') },
          ...(job.company ? [{ label: c.hideCompany, icon: <Building2 className="size-4" aria-hidden="true" />, onSelect: () => void hide(job, 'company') }] : []),
        ]} />}
      </li>;
    })}
  </ul>;

  const loadingList = <div className="grid gap-3">
    <span className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />{c.loading}</span>
    {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
  </div>;

  const failed = (!sample && status === 'error') || (smartActive && cvs.status === 'error');
  const waiting = !sample && !awaiting && (status === 'loading' || (smartActive && cvs.status === 'loading'));
  const hasMore = smartActive ? nextOffset < Math.min(total, 1001) : items.length < Math.min(total, 1001);  // the service serves offsets up to 1000
  const capped = !sample && !smartActive && total > 1000 && !hasMore;

  return <section className="grid gap-3 sm:gap-6 lg:gap-8">
    <div className="grid gap-1">
      <PageBack to={`/app/projects/${projectId}/overview`}>{t('nav.overview')}</PageBack>
      <PageHeader icon={Search} title={c.title} lede={grandTotal != null ? (!sample && facetsRes.data?.new_7d != null && facetsRes.data.thai_postings != null
        ? c.stats(number.format(grandTotal), number.format(facetsRes.data.new_7d), number.format(facetsRes.data.thai_postings)) : c.subtitle(number.format(grandTotal))) : undefined} actions={
        <div role="group" aria-label={c.modeLabel} className="segmented w-fit max-w-full">
          {([['search', c.modeSearch], ['match', c.modeMatch]] as const).map(([key, label]) => {
            const on = (key === 'match') === smart;
            return <button key={key} type="button" aria-pressed={on} onClick={() => setSearchMode(key)}
              className={`min-h-11 px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? '' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>;
          })}
        </div>} />
    </div>

    <div className="grid gap-2 sm:gap-5">
    <div className="grid gap-2 sm:gap-3">
    {smartActive && ai?.status !== 'unavailable' && <p className="text-xs text-muted-foreground">{c.privacy}</p>}
    {smartActive && gate.blocked && gate.title && <Alert severity="warning">{gate.title}</Alert>}
    </div>

    {smartActive && usable.length > 0 && <div className="flex flex-wrap items-end gap-3 rounded-lg bg-card p-4">
      <div className="grid min-w-0 gap-2 sm:w-72">
        <Label htmlFor="match-cv">{c.cvLabel}</Label>
        <Select id="match-cv" value={cv?.id ?? ''} onChange={e => setCvPick(e.target.value)}>
          {usable.map(item => <option key={item.id} value={item.id}>{item.name} · v{item.latest_revision?.revision}</option>)}
        </Select>
      </div>
      {cv?.latest_revision && <CvPreviewButton projectId={projectId} fileId={cv.latest_revision.file_id} name={cv.name} revision={cv.latest_revision.revision} filename={cv.latest_revision.original_filename} mimeType={cv.latest_revision.mime_type} variant="outline" />}
      <p className="flex min-h-11 min-w-0 items-center gap-2 text-sm text-muted-foreground"><Info className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0">{tSearch('controls.cvChangeNote')}</span></p>
    </div>}

    {sample && <Card className="border-transparent bg-accent text-accent-foreground">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="min-w-0 break-words text-sm"><Badge variant="outline" className="mr-2">{c.sampleBanner}</Badge>{c.sampleBody}</p>
        <Button variant="outline" size="sm" onClick={() => { setSample(false); setSelectedSlug(null); }}>{c.backLive}</Button>
      </CardContent>
    </Card>}

    <div role="search" aria-label={tSearch('controls.searchBand')} className="grid grid-cols-2 items-start gap-3 rounded-xl border bg-card p-4 sm:gap-4 sm:p-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="col-span-2 grid min-w-0 gap-2 lg:col-span-1">
        <Label htmlFor="job-search" className="text-sm text-muted-foreground">{c.searchLabel}</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="job-search" type="search" className="py-0 pl-10" value={qInput} placeholder={c.searchPlaceholder} onChange={e => setQInput(e.target.value)} />
        </div>
        <p className="text-sm text-muted-foreground">{tSearch(smart ? 'controls.modeHintMatch' : 'controls.modeHintSearch')}</p>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="job-city" className="text-sm text-muted-foreground">{tSearch('controls.location')}</Label>
        <Select id="job-city" className="py-0" value={city} onChange={e => setFilter('cities', e.target.value)}>
          <option value="">{tSearch('controls.anyLocation')}</option>
          {cities.map(f => { const name = provinceName(f); return <option key={f.value} value={f.value}>{f.count ? `${name} (${number.format(f.count)})` : name}</option>; })}
        </Select>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="job-mode" className="text-sm text-muted-foreground">{c.mode}</Label>
        <Select id="job-mode" className="py-0" value={mode} onChange={e => setFilter('work_mode', e.target.value)}>
          <option value="">{c.anyMode}</option>
          {(['remote', 'hybrid', 'onsite'] as const).map(m => <option key={m} value={m}>{c[m]}</option>)}
        </Select>
      </div>
    </div>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
    <div className="grid min-w-0 gap-3 sm:gap-5">
    {!sample && <AdvancedFilters locale={locale} get={get} setMany={setMany} facets={facetsRes.data ?? undefined} number={number} additionalCount={(category ? 1 : 0) + (posted ? 1 : 0)}>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="job-posted">{c.posted}</Label>
        <Select id="job-posted" value={posted} disabled={sample} onChange={e => setFilter('posted_within_days', e.target.value)}>
          <option value="">{c.anyPosted}</option>
          {[7, 14, 30].map(d => <option key={d} value={String(d)}>{c.days(d)}</option>)}
        </Select>
      </div>
      <Presets locale={locale} get={get} setMany={setMany} />
      {categories.length > 0 && <div role="group" aria-label={c.categories} className="flex flex-wrap gap-2">
        <h3 className="w-full text-sm font-semibold">{c.categories}</h3>
        {categories.map(f => <Button key={f.value} type="button" variant="outline" size="sm" className="h-auto whitespace-normal text-left" aria-pressed={category === f.value}
          onClick={() => setFilter('category', category === f.value ? '' : f.value)}>
          {catLabel(f.value)}{f.count ? <span className="text-muted-foreground">{number.format(f.count)}</span> : null}
        </Button>)}
      </div>}
    </AdvancedFilters>}
    {activeFilterChips.length > 0 && <div role="group" className="flex flex-wrap items-center gap-2" aria-label={tSearch('controls.activeFilters')}>
      {activeFilterChips.map(chip => <Button key={`${chip.key}:${chip.label}`} type="button" variant="secondary" size="sm" className="h-auto max-w-full whitespace-normal text-left" aria-label={tSearch('controls.removeFilter', { label: chip.label })} onClick={() => removeFilter(chip.key)}>
        <span className="break-words">{chip.label}</span><X className="size-3.5 shrink-0" aria-hidden="true" />
      </Button>)}
      <Button type="button" variant="link" className="h-auto p-0" onClick={clear}>{tSearch('controls.clearFilters')}</Button>
    </div>}
    </div>
    <SavedSearchesPanel projectId={projectId} params={params} onApply={changes => { setQInput(changes.q ?? ''); setMany(changes); }} />
    </div>

    {!sample && !filtered && <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{tSearch('controls.examplesLabel')}</span>
      {(tSearch('controls.examples', { returnObjects: true }) as unknown as string[]).map(example => <Button key={example} type="button" variant="outline" size="sm" className="h-auto whitespace-normal" onClick={() => { setQInput(example); setFilter('q', example); }}>{example}</Button>)}
    </div>}

    </div>

    {failed ? <Card role="alert"><CardContent className="grid gap-4 p-6">
      <h2 className="flex items-start gap-2 break-words font-semibold"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" /><span className="min-w-0">{profileFailed ? c.analyzeError : c.errTitle}</span></h2>
      <p className="text-sm text-muted-foreground">{c.errBody}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => { profiled.current = ''; setVersion(v => v + 1); if (smartActive) cvs.reload(); }}>{c.retry}</Button>
        <Button variant="outline" onClick={() => { setSample(true); setSelectedSlug(null); }}>{c.viewSample}</Button>
      </div>
    </CardContent></Card> : needsCv ? <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6">
      <p className="font-medium">{c.noCv}</p>
      <p className="text-sm text-muted-foreground">{c.noCvBody}</p>
      <div className="flex flex-wrap gap-2"><Button asChild><Link to={`/app/projects/${projectId}/profile`}>{c.addCv}</Link></Button><BuildCvButton projectId={projectId} /></div>
    </div> : awaiting ? <SmartMatchStart locale={locale} cvName={cv ? `${cv.name} · v${cv.latest_revision?.revision}` : ''} disabled={gate.blocked} title={gate.title} onStart={() => setArmedFor(revisionId)} /> : <div className="grid gap-3">
      {sample && smart && <p className="text-sm text-muted-foreground">{c.sampleMatch}</p>}
      <p role="status" aria-live="polite" className={sample || !waiting ? 'text-sm text-muted-foreground' : 'sr-only'}>{sample || !waiting ? <>{c.found(number.format(shownTotal))}{smartActive ? ` · ${c.poolNote(number.format(poolCount || items.length))}` : ''}</> : c.loading}</p>
      {smartActive && ai?.status === 'unavailable' && <Alert severity="warning"><p>{c.unavailable}</p><p className="text-xs text-muted-foreground">{tSearch('methods.keywordOnly')}</p></Alert>}
      {smartActive && !ranking && ai?.status === 'partial' && <Alert severity="info">{tSearch('controls.partialRank', { scored: ai.scored, total: items.length })}</Alert>}
      {smartActive && poolCount > 0 && total > poolCount && <p className="text-xs text-muted-foreground">{tSearch('controls.poolLimited', { count: number.format(poolCount), total: number.format(total) })}</p>}
      {smartActive && rankFailed && <Alert severity="error" action={<Button type="button" size="sm" variant="outline" onClick={() => setVersion(v => v + 1)}>{c.retry}</Button>}>{c.rankFailed}</Alert>}
      {smartActive && !category && !q && ai?.categories && ai.categories.length > 0 && <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{c.autoCats}</span>
        {ai.categories.map(slug => <Button key={slug} type="button" variant="outline" size="sm" className="h-auto" onClick={() => setFilter('category', slug)}>{catLabel(slug)}</Button>)}
      </div>}
      {thaiHintLine}
      {undo && <Alert severity="info" action={undo.retry && <Button type="button" size="sm" variant="outline" onClick={() => void unhide(undo.id)}><RotateCcw className="size-4" aria-hidden="true" />{c.undo}</Button>}>{undo.message}</Alert>}
      {smartActive && ranking && <div className="grid gap-2"><AgentSteps c={c} step={items.length === 0 ? 1 : 2} scored={ai?.scored ?? 0} total={items.length} /><span className="text-xs text-muted-foreground">{tSearch('methods.keywordOnly')}</span></div>}
      {profiling ? <AgentSteps c={c} step={0} scored={0} total={0} /> : waiting ? loadingList : visible.length === 0 && smartActive && ranking && !q && !category && ai?.status === 'missing' ? null : visible.length === 0 ? <div className="flex flex-col items-start gap-2 rounded-xl border bg-card p-6 sm:p-8">
        <Search className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">{c.none}</p>
        <p className="text-sm text-muted-foreground">{c.noneNext}</p>
        <Button variant="outline" size="sm" onClick={clear} disabled={!filtered}>{c.clear}</Button>
      </div> : showMobileDetail && selected ? <section className="grid min-w-0 gap-4" aria-label={selected.title}>
        <Button ref={detailBack} type="button" variant="outline" className="justify-self-start" onClick={() => {
          const previous = selectedSlug;
          setSelectedSlug(null);
          window.requestAnimationFrame(() => {
            window.scrollTo({ top: selectionScroll.current, behavior: 'instant' as ScrollBehavior });
            if (previous) document.querySelector<HTMLButtonElement>(`[data-job-slug="${CSS.escape(previous)}"]`)?.focus({ preventScroll: true });
          });
        }}><ArrowLeft className="size-4" aria-hidden="true" />{tSearch('controls.backToResults')}</Button>
        <div className="min-w-0 rounded-xl border bg-card p-5">{detail(selected)}</div>
      </section> : <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="grid min-w-0 gap-3 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1">
          {list}
          {capped && <p role="status" className="text-sm text-muted-foreground">{c.capNote}</p>}
          {!sample && hasMore && <div className="grid justify-items-start gap-2">
            {moreError && <Alert severity="error">{c.errTitle}</Alert>}
            <Button variant="outline" disabled={loadingMore} aria-busy={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" />{c.loading}</> : c.loadMore}
            </Button>
          </div>}
        </div>
        {wide && selected && <Card className="sticky top-4 min-w-0 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"><CardContent className="p-6">{detail(selected)}</CardContent></Card>}
      </div>}
      {smartActive && hiddenCount > 0 && <div><Button type="button" variant="link" className="h-auto p-0" onClick={() => setHiddenOpen(true)}>{c.hiddenLink(hiddenCount)}</Button></div>}
    </div>}

    <Dialog open={hiddenOpen} onOpenChange={open => { setHiddenOpen(open); setDialogError(false); }}>
      <DialogContent>
        <DialogTitle>{c.hiddenTitle}</DialogTitle>
        <DialogDescription className="sr-only">{c.hiddenTitle}</DialogDescription>
        {dialogError && <Alert severity="error">{c.undoFailed}</Alert>}
        {hiddenRes.status === 'loading' ? <BusyNote locale={locale} label={c.loading} /> : hiddenRes.status === 'error' ? <ErrorState onRetry={hiddenRes.reload} /> : (hiddenRes.data?.items ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{c.hiddenEmpty}</p>
          : <ul className="grid max-h-[60vh] gap-2 overflow-y-auto">{(hiddenRes.data?.items ?? []).map(h => <li key={h.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
            <span className="min-w-0 [overflow-wrap:anywhere]"><Badge variant="secondary" className="mr-2">{c.kindWord[h.kind]}</Badge>{h.label}</span>
            <Button type="button" size="sm" variant="outline" className="shrink-0 whitespace-nowrap" disabled={busyId !== null} onClick={() => void unhide(h.id, true)}>{c.unhide}</Button>
          </li>)}</ul>}
      </DialogContent>
    </Dialog>

  </section>;
}
