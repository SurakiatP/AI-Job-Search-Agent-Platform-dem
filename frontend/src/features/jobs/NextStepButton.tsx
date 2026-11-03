import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ApplicationStage, CVView, RunView, SessionView } from '../../lib/api-types';
import { latestEvaluations } from '../overview/latestEvaluations';
import { nextStep, type NextStep } from '../overview/nextStep';
import { EvaluateButton } from '../sessions/EvaluateButton';

export type JobFlowData = { cvs?: CVView[]; runs?: RunView[]; sessions?: SessionView[] };

/** Everything one job needs to show its single next step, built from lists the page already loads. */
export function jobFlow(data: JobFlowData, jobId: string, stage: ApplicationStage) {
  const runs = data.runs ?? [];
  const evaluation = latestEvaluations(runs, data.sessions).get(jobId);
  const waiting = runs.find(run => run.job_revision_id === jobId && (run.status === 'needs_input' || run.status === 'waiting_approval'));
  const drafted = runs.some(run => run.job_revision_id === jobId && run.operation === 'draft_documents' && run.status === 'completed');
  const step = nextStep({
    hasCv: (data.cvs ?? []).some(cv => cv.latest_revision),
    extractionRunning: false,
    waitingRunId: waiting?.id,
    job: { id: jobId, stage, session: evaluation ? { id: evaluation.session_id ?? '', scored: true, drafted } : undefined },
  });
  const score = evaluation?.evaluation_result?.score ?? null;
  return { step, score, waitingSessionId: waiting?.session_id ?? null, evaluationSessionId: evaluation?.session_id ?? null };
}

export function NextStepButton({ projectId, jobId, step, waitingSessionId, cvName, onApplied, className }: {
  projectId: string; jobId: string; step: NextStep; waitingSessionId?: string | null; cvName?: string; onApplied: () => void; className?: string;
}) {
  const { t } = useTranslation('applicationsWorkspace');
  const base = `/app/projects/${projectId}`;
  const label = t(`step.${step.key}`);
  const { action } = step;
  const to = action.type === 'link' ? `${base}/${action.to}`
    : action.type === 'draft' ? `${base}/sessions/${action.sessionId}`
    : action.type === 'openRun' ? `${base}/sessions/${waitingSessionId ?? ''}`
    : action.type === 'pickFile' ? `${base}/profile` : null;
  if (action.type === 'evaluate') return <EvaluateButton projectId={projectId} job={{ savedId: jobId }} cvName={cvName}>{label}</EvaluateButton>;
  if (action.type === 'setStage') return <Button type="button" className={className} onClick={onApplied}>{label}</Button>;
  if (to) return <Button asChild className={className}><Link to={to}>{label}</Link></Button>;
  return <span className="text-sm text-muted-foreground">{label}</span>;
}
