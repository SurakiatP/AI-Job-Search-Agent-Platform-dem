import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ApplyPack, ApprovalView, JobRevisionView, RunView } from '@/lib/api-types';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { sendJson, useResource } from '../projects/useResource';
import type { Copy } from './copy';
import { Empty, relativeTime, useNow, type Locale } from './shared';

function SubmitDetail({ projectId, approval, c }: { projectId: string; approval: ApprovalView; c: Copy }) {
  const run = useResource<RunView>(`/projects/${projectId}/runs/${encodeURIComponent(approval.target_run_id ?? '')}`);
  const jobs = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const pack = run.data?.result_payload as ApplyPack | undefined;
  const title = jobs.data?.find(job => job.id === run.data?.job_revision_id)?.title;
  if (run.status === 'error' || (run.status === 'ready' && pack?.kind !== 'apply_pack')) return <p role="alert" className="text-sm text-destructive">{c.packGone}</p>;
  if (!pack) return null;
  return <div className="grid gap-2 text-sm">
    <p><span className="text-muted-foreground">{c.job}: </span><span className="font-medium [overflow-wrap:anywhere]">{title ?? '—'}</span></p>
    <h3 className="font-medium">{c.answers}</h3>
    <ul className="grid gap-2">{pack.answers.map(a => <li key={a.question_id} className="grid gap-0.5 rounded-lg border p-3">
      <span className="text-muted-foreground [overflow-wrap:anywhere]">{a.question_id}</span>
      {a.answer === null ? <Badge variant="warning" className="justify-self-start">{c.notAnswerable}</Badge> : <span className="[overflow-wrap:anywhere]">{String(a.answer)}</span>}
      <span className="text-xs text-muted-foreground">{a.evidence_ids.length} {c.evidenceN}</span>
    </li>)}</ul>
    {pack.missing_required.length > 0 && <div><h3 className="font-medium text-warning">{c.missingReq}</h3><ul className="list-disc ps-5">{pack.missing_required.map(id => <li key={id} className="[overflow-wrap:anywhere]">{id}</li>)}</ul></div>}
    <p className="text-muted-foreground">{c.applyNote}</p>
  </div>;
}

export function ApprovalsTab({ projectId, locale, c }: { projectId: string; locale: Locale; c: Copy }) {
  const project = encodeURIComponent(projectId);
  const approvals = useResource<ApprovalView[]>(`/projects/${project}/approvals`);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const runs = useResource<RunView[]>(`/projects/${project}/runs`);
  const sessionOf = new Map((runs.data ?? []).map(run => [run.id, run.session_id]));
  const now = useNow(30000);

  async function decide(id: string, decision: 'approve' | 'reject') {
    if (busyId) return;
    setBusyId(id); setFailed(false);
    try { await sendJson(`/projects/${project}/approvals/${encodeURIComponent(id)}/decision`, 'POST', { decision }); }
    catch { setFailed(true); }
    finally { setBusyId(null); approvals.reload(); }
  }

  if (approvals.status === 'error') return <ErrorState onRetry={approvals.reload} />;
  if (approvals.status === 'loading' && !approvals.data) return <LoadingState />;
  if ((approvals.data ?? []).length === 0) return <Empty title={c.noApprovals} next={c.noApprovalsNext} />;
  // newest first: approvals carry no created_at, so order by expiry (fixed TTL after creation)
  const sorted = [...(approvals.data ?? [])].sort((a, b) => Date.parse(b.expires_at) - Date.parse(a.expires_at));
  const isPending = (a: ApprovalView) => a.decision === null && a.consumed_at === null && Date.parse(a.expires_at) > now;
  const pending = sorted.filter(isPending);
  const resolved = sorted.filter(a => !isPending(a));
  const base = `/app/projects/${project}`;
  const runLink = (a: ApprovalView) => { const sessionId = sessionOf.get(a.run_id); return sessionId ? <Link className="text-sm text-primary hover:underline" to={`${base}/sessions/${encodeURIComponent(sessionId)}`}>{c.openRun}</Link> : null; };
  const label = (a: ApprovalView) => a.decision === 'approve' ? <Badge variant="success">{c.approved}</Badge> : a.decision === 'reject' ? <Badge variant="secondary">{c.rejected}</Badge> : a.consumed_at ? <Badge variant="secondary">{c.used}</Badge> : <Badge variant="secondary">{c.expired}</Badge>;
  return <div className="grid gap-6">
    {failed && <p role="alert" className="text-sm text-destructive">{c.opaction}</p>}
    <section aria-labelledby="pending-heading" className="grid gap-3">
      <h2 id="pending-heading" className="text-lg font-semibold">{c.pending} <span className="tabular-nums text-muted-foreground">({pending.length})</span></h2>
      {pending.length === 0 ? <p className="text-sm text-muted-foreground">{c.noPending}</p> : pending.map(a => <Card key={a.id} className="border-warning">
        <CardContent className="grid gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="min-w-0 font-medium [overflow-wrap:anywhere]">{c.actions[a.action]}</p>
            <span className="text-sm text-muted-foreground">{c.expiresIn} <time dateTime={a.expires_at}>{relativeTime(a.expires_at, now, locale)}</time></span>
          </div>
          {a.action === 'submit_application' && a.target_run_id && <SubmitDetail projectId={project} approval={a} c={c} />}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={busyId !== null} onClick={() => void decide(a.id, 'approve')}>{a.action === 'submit_application' ? c.approveApply : c.approve}</Button>
            <Button type="button" variant="outline" disabled={busyId !== null} onClick={() => void decide(a.id, 'reject')}>{c.reject}</Button>
            {runLink(a)}
          </div>
        </CardContent>
      </Card>)}
    </section>
    {resolved.length > 0 && <section aria-labelledby="resolved-heading" className="grid gap-2">
      <h2 id="resolved-heading" className="text-lg font-semibold">{c.resolved}</h2>
      <ul className="divide-y rounded-xl border bg-card text-muted-foreground">{resolved.map(a => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
        <span className="min-w-0 [overflow-wrap:anywhere]">{c.actions[a.action]}</span>
        <span className="flex flex-wrap items-center gap-3">{label(a)}{runLink(a)}</span>
      </li>)}</ul>
    </section>}
  </div>;
}
