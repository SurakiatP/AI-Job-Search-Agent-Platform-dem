// Contract (UX_SIMPLIFY_PLAN 3.2). Pure: no fetching, no i18n. The caller maps `labelKey` to copy and runs `action`.
import type { ApplicationStage } from '../../lib/api-types';

export type NextStepKey = 'uploadCv' | 'readingCv' | 'findJob' | 'getFitScore' | 'draftLetter' | 'markApplied' | 'practise' | 'answerAi';

export type NextStepAction =
  | { type: 'pickFile' }
  | { type: 'none' }
  | { type: 'link'; to: 'search' | `sessions/${string}?tab=practice` }
  | { type: 'evaluate'; jobId: string }
  | { type: 'draft'; sessionId: string }
  | { type: 'setStage'; stage: 'applied' }
  | { type: 'openRun'; runId: string };

export type NextStep = { key: NextStepKey; labelKey: `nextStep.${NextStepKey}`; action: NextStepAction };

export type NextStepInput = {
  hasCv: boolean;
  extractionRunning: boolean;
  /** Job this decision is about; absent on a project with no job yet. */
  job?: {
    id: string;
    stage?: ApplicationStage;
    session?: { id: string; scored: boolean; drafted: boolean };
  };
  /** Run waiting on the user (`needs_input` or `waiting_approval`). Wins over everything else. */
  waitingRunId?: string;
};

export function nextStep(i: NextStepInput): NextStep {
  const make = (key: NextStepKey, action: NextStepAction): NextStep => ({ key, labelKey: `nextStep.${key}`, action });
  if (i.waitingRunId) return make('answerAi', { type: 'openRun', runId: i.waitingRunId });
  if (!i.hasCv) return make('uploadCv', { type: 'pickFile' });
  if (i.extractionRunning) return make('readingCv', { type: 'none' });
  const job = i.job;
  if (!job) return make('findJob', { type: 'link', to: 'search' });
  const s = job.session;
  if (!s?.scored) return make('getFitScore', { type: 'evaluate', jobId: job.id });
  if (job.stage === 'interview') return make('practise', { type: 'link', to: `sessions/${s.id}?tab=practice` });
  if (!s.drafted) return make('draftLetter', { type: 'draft', sessionId: s.id });
  if (!job.stage || job.stage === 'saved') return make('markApplied', { type: 'setStage', stage: 'applied' });
  return make('practise', { type: 'link', to: `sessions/${s.id}?tab=practice` });
}
