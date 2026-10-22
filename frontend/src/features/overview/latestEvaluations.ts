import type { RunView, SessionView } from '@/lib/api-types';

// Only evaluations whose session is still visible: runs of a trashed session stay in the run list.
export function latestEvaluations(runs: RunView[], visibleSessions: SessionView[] | undefined): Map<string, RunView> {
  const visible = new Set((visibleSessions ?? []).map(session => session.id));
  const latest = new Map<string, RunView>();
  for (const run of runs) {
    if (run.operation !== 'evaluate_job' || run.status !== 'completed' || !run.job_revision_id || !visible.has(run.session_id ?? '')) continue;
    const current = latest.get(run.job_revision_id);
    if (!current || run.created_at > current.created_at) latest.set(run.job_revision_id, run);
  }
  return latest;
}
