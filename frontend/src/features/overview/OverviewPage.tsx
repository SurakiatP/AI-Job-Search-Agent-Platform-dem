import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FitScore } from '@/components/FitScore';
import { SkillCount } from '@/components/SkillCoverage';
import { StatusBadge } from '@/components/StatusBadge';
import type { DocumentView, JobRevisionView, ProjectView, RunView, SessionView } from '@/lib/api-types';
import { ErrorState } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import { JobRemoveMenu } from '../jobs/JobRemoveMenu';
import { latestEvaluations } from './latestEvaluations';

type CvRevision = { id: string; revision: number; original_filename?: string; mime_type?: string; size_bytes?: number; created_at?: string };

const copy = {
  th: {
    subtitle: 'ภาพรวมโปรเจกต์ งานที่บันทึก เอกสาร และงานของเอเจนต์', evaluate: 'ประเมินงานใหม่',
    saved: 'งานที่บันทึก', applied: 'สมัครแล้ว', documents: 'เอกสาร',
    jobsTitle: 'งานที่บันทึกไว้', noJobs: 'ยังไม่มีงานที่บันทึก', noJobsNext: 'ไปที่หน้างานเพื่อเพิ่มประกาศงานแรก', addJob: 'เพิ่มงาน', viewAll: 'ดูทั้งหมด',
    docsTitle: 'เอกสารล่าสุด', noDocs: 'ยังไม่มีเอกสาร', noDocsNext: 'ประเมินงานแล้วให้เอเจนต์ร่างเอกสารให้', revision: 'ฉบับที่',
    cvTitle: 'CV ของคุณ', noCv: 'ยังไม่มี CV', noCvNext: 'เพิ่ม CV เพื่อให้เอเจนต์ประเมินงานได้', addCv: 'เพิ่ม CV', updateCv: 'อัปเดต CV',
    activity: 'งานของเอเจนต์', idle: 'ไม่มีงานที่กำลังทำ', approvals: 'รออนุมัติ', openSession: 'เปิดเซสชัน', untitled: 'งานไม่มีชื่อ', evaluating: 'ประเมินงาน', drafting: 'ร่างเอกสาร',
    cv: 'CV', cover_letter: 'จดหมายสมัครงาน', other: 'เอกสารอื่น',
  },
  en: {
    subtitle: 'Project overview: saved jobs, documents and agent activity', evaluate: 'Evaluate a new job',
    saved: 'Saved jobs', applied: 'Applied', documents: 'Documents',
    jobsTitle: 'Saved jobs', noJobs: 'No saved jobs yet', noJobsNext: 'Open Jobs to add your first posting.', addJob: 'Add a job', viewAll: 'View all',
    docsTitle: 'Latest documents', noDocs: 'No documents yet', noDocsNext: 'Evaluate a job, then ask the agent to draft documents.', revision: 'Revision',
    cvTitle: 'Your CV', noCv: 'No CV yet', noCvNext: 'Add a CV so the agent can evaluate jobs.', addCv: 'Add CV', updateCv: 'Update CV',
    activity: 'Agent activity', idle: 'Nothing running', approvals: 'Pending approvals', openSession: 'Open session', untitled: 'Untitled job', evaluating: 'Evaluating job', drafting: 'Drafting documents',
    cv: 'CV', cover_letter: 'Cover letter', other: 'Other',
  },
};

const ACTIVE = ['queued', 'running', 'waiting_approval'];

function formatSize(bytes: number) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function OverviewSkeleton() {
  return <div className="grid gap-6" role="status" aria-live="polite">
    <Skeleton className="h-10 w-2/3 max-w-md" />
    <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24" />)}</div>
    <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div>
  </div>;
}

function Empty({ title, next, children }: { title: string; next: string; children?: React.ReactNode }) {
  return <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4"><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{next}</p>{children}</div>;
}

export function OverviewPage() {
  const { projectId = '' } = useParams();
  const { i18n } = useTranslation();
  const locale: 'th' | 'en' = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const base = `/app/projects/${projectId}`;
  const project = useResource<ProjectView>(`/projects/${projectId}`);
  const cv = useResource<CvRevision[]>(`/projects/${projectId}/cv`);
  const jobs = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const documents = useResource<DocumentView[]>(`/projects/${projectId}/documents`);
  const runs = useResource<RunView[]>(`/projects/${projectId}/runs`);
  const sessions = useResource<SessionView[]>(`/projects/${projectId}/sessions`);
  const all = [project, cv, jobs, documents, runs, sessions];

  if (all.some(r => r.status === 'error')) return <ErrorState onRetry={() => all.forEach(r => r.status === 'error' && r.reload())} />;
  if (all.some(r => r.status !== 'ready')) return <OverviewSkeleton />;

  const jobList = jobs.data ?? [];
  const docList = documents.data ?? [];
  const runList = runs.data ?? [];
  const evaluations = latestEvaluations(runList);
  const latestCv = (cv.data ?? []).reduce<CvRevision | null>((best, item) => (!best || item.revision > best.revision ? item : best), null);
  const activeRuns = runList.filter(run => ACTIVE.includes(run.status)).slice(0, 5);
  const pending = runList.filter(run => run.status === 'waiting_approval');
  const pendingSession = pending[0]?.session_id;
  const evaluateHref = sessions.data?.[0] ? `${base}/sessions/${sessions.data[0].id}` : `${base}/profile`;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const stats = [
    { label: c.saved, value: jobList.length, to: `${base}/jobs` }, { label: c.applied, value: jobList.filter(j => j.application_status === 'applied').length, to: `${base}/jobs` }, { label: c.documents, value: docList.length, to: `${base}/documents` },
  ];

  return <div className="grid gap-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h1 className="break-words text-2xl font-semibold">{project.data?.name}</h1><p className="text-sm text-muted-foreground">{c.subtitle}</p></div>
      <Button asChild><Link to={evaluateHref}>{c.evaluate}</Link></Button>
    </div>

    <div className="grid gap-4 sm:grid-cols-3">{stats.map(s => <Link key={s.label} to={s.to} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"><Card className="transition-shadow hover:shadow-md"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{s.label}</p><p className="text-3xl font-semibold tabular-nums">{s.value}</p></CardContent></Card></Link>)}</div>

    <div className="grid gap-6 lg:grid-cols-3">
      <div className="grid gap-6 lg:col-span-2 lg:content-start">
        <Card>
          <CardHeader><CardTitle><Link className="hover:underline" to={`${base}/jobs`}>{c.jobsTitle}</Link></CardTitle></CardHeader>
          <CardContent>
            {jobList.length === 0 ? <Empty title={c.noJobs} next={c.noJobsNext}><Button asChild size="sm"><Link to={`${base}/jobs`}>{c.addJob}</Link></Button></Empty> :
              <ul className="divide-y">{jobList.slice(0, 6).map(job => <li key={job.id} className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <FitScore score={evaluations.get(job.id)?.evaluation_result?.score ?? null} locale={locale} />
                <div className="min-w-0 flex-1"><Link className="break-words font-medium hover:underline" to={`${base}/jobs/${job.id}`}>{job.title}</Link>{job.company && <p className="break-words text-sm text-muted-foreground">{job.company}</p>}<SkillCount coverage={evaluations.get(job.id)?.evaluation_result?.skill_coverage} locale={locale} /></div>
                <StatusBadge status={job.application_status ?? 'saved'} locale={locale} />
                <JobRemoveMenu reveal projectId={projectId} jobId={job.id} title={job.title} onRemoved={jobs.reload} />
              </li>)}</ul>}
          </CardContent>
          {jobList.length > 0 && <CardFooter><Link className="text-sm text-primary hover:underline" to={`${base}/jobs`}>{c.viewAll}</Link></CardFooter>}
        </Card>
        <Card>
          <CardHeader><CardTitle><Link className="hover:underline" to={`${base}/documents`}>{c.docsTitle}</Link></CardTitle></CardHeader>
          <CardContent>
            {docList.length === 0 ? <Empty title={c.noDocs} next={c.noDocsNext} /> :
              <ul className="divide-y">{docList.slice(0, 4).map(doc => <li key={doc.id} className="py-3 first:pt-0 last:pb-0">
                <Link className="break-words font-medium hover:underline" to={`${base}/documents/${doc.id}`}>{doc.title}</Link>
                <p className="text-sm text-muted-foreground">{c[doc.document_type]}{doc.latest_revision ? ` · ${c.revision} ${doc.latest_revision.revision}` : ''}</p>
              </li>)}</ul>}
          </CardContent>
          {docList.length > 0 && <CardFooter><Link className="text-sm text-primary hover:underline" to={`${base}/documents`}>{c.viewAll}</Link></CardFooter>}
        </Card>
      </div>

      <div className="grid gap-6 lg:content-start">
        <Card>
          <CardHeader><CardTitle><Link className="hover:underline" to={`${base}/profile`}>{c.cvTitle}</Link></CardTitle></CardHeader>
          <CardContent>
            {latestCv ? <div className="grid gap-3">
              <div><p className="break-words font-medium">{latestCv.original_filename ?? `${c.revision} ${latestCv.revision}`}</p>
                <p className="text-sm text-muted-foreground">{c.revision} {latestCv.revision}{latestCv.created_at ? ` · ${date.format(new Date(latestCv.created_at))}` : ''}{latestCv.size_bytes ? ` · ${formatSize(latestCv.size_bytes)}` : ''}</p></div>
              <Button asChild variant="outline"><Link to={`${base}/profile`}>{c.updateCv}</Link></Button>
            </div> : <Empty title={c.noCv} next={c.noCvNext}><Button asChild size="sm"><Link to={`${base}/profile`}>{c.addCv}</Link></Button></Empty>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle><Link className="hover:underline" to={`${base}/console`}>{c.activity}</Link></CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {activeRuns.length === 0 && pending.length === 0 && <p className="text-sm text-muted-foreground">{c.idle}</p>}
            {activeRuns.map(run => <Link key={run.id} to={`${base}/sessions/${run.session_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 hover:bg-accent">
              <span className="min-w-0 break-words text-sm">{run.operation === 'evaluate_job' ? c.evaluating : c.drafting}</span><StatusBadge status={run.status} locale={locale} />
            </Link>)}
            {pending.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{c.approvals}: <strong className="tabular-nums">{pending.length}</strong></span>
              {pendingSession && <Link className="text-primary hover:underline" to={`${base}/sessions/${pendingSession}`}>{c.openSession}</Link>}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  </div>;
}
