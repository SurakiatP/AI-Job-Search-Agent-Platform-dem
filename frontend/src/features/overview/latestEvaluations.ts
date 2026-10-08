import type { RunView } from '@/lib/api-types';

export function latestEvaluations(runs: RunView[]): Map<string, RunView> {
  const latest = new Map<string, RunView>();
  for (const run of runs) {
    if (run.operation !== 'evaluate_job' || run.status !== 'completed' || !run.job_revision_id) continue;
    const current = latest.get(run.job_revision_id);
    if (!current || run.created_at > current.created_at) latest.set(run.job_revision_id, run);
  }
  return latest;
}
