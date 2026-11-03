import type { ReactNode } from 'react';
import { NewSessionButton, type InlineJobDraft } from './NewSessionDialog';

// Contract (UX_SIMPLIFY_PLAN 3.1). W2 replaces the body: pick the primary or only usable CV, POST the session,
// open an existing pair on `session_pair_exists`, then go to `/sessions/:id?start=evaluate`.
// `cvId` forces a CV and skips the default pick. Stub: still opens the existing dialog.
export type EvaluateJob = { savedId: string; inline?: never } | { inline: InlineJobDraft; savedId?: never };
export type EvaluateButtonProps = { projectId: string; job: EvaluateJob; cvId?: string; cvName?: string; children: ReactNode };

export function EvaluateButton({ projectId, job, cvName, children }: EvaluateButtonProps) {
  return <NewSessionButton projectId={projectId} job={job} cvName={cvName}>{children}</NewSessionButton>;
}
