import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { apiRequest } from '../../lib/api';
import { ApiError, type CVView, type SessionView } from '../../lib/api-types';
import { NewSessionDialog, type InlineJobDraft } from './NewSessionDialog';

// Contract (UX_SIMPLIFY_PLAN 3.1): pick the primary or only usable CV, POST the session, open an existing pair on
// `session_pair_exists`, then go to `/sessions/:id?start=evaluate`. `cvId` forces a CV and skips the default pick.
// No usable CV, several CVs without a primary, or any failure: fall back to the CV picker dialog.
// `changeCv` adds the small "Change CV" link that opens that dialog on purpose.
export type EvaluateJob = { savedId: string; inline?: never } | { inline: InlineJobDraft; savedId?: never };
export type EvaluateButtonProps = { projectId: string; job: EvaluateJob; cvId?: string; cvName?: string; changeCv?: boolean; children: ReactNode } & Omit<React.ComponentProps<typeof Button>, 'onClick' | 'children'>;

export function EvaluateButton({ projectId, job, cvId, cvName, changeCv = false, children, ...props }: EvaluateButtonProps) {
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith('th');
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(false);
  const base = `/app/projects/${projectId}`;
  const open = (id: string) => navigate(`${base}/sessions/${id}?start=evaluate`);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const cvs = (await apiRequest<CVView[]>(`/projects/${projectId}/cvs`)).filter(item => item.latest_revision);
      const pick = cvId ? cvs.find(item => item.id === cvId) : cvs.length === 1 ? cvs[0] : cvs.find(item => item.is_primary);
      if (!pick?.latest_revision) { setDialog(true); return; }
      const draft = job.inline;
      const jobPart = draft ? { job: { title: draft.title.trim(), description: draft.description.trim(), ...(draft.company?.trim() ? { company: draft.company.trim() } : {}), ...(draft.source_url?.trim() ? { source_url: draft.source_url.trim() } : {}) } } : { job_revision_id: job.savedId };
      try {
        const session = await apiRequest<SessionView>(`/projects/${projectId}/sessions`, { method: 'POST', body: JSON.stringify({ cv_revision_id: pick.latest_revision.id, ...jobPart }) });
        window.dispatchEvent(new Event('sessions:changed'));
        open(session.id);
      } catch (caught) {
        if (caught instanceof ApiError && caught.code === 'session_pair_exists' && caught.fields?.session_id) open(caught.fields.session_id);
        else setDialog(true);
      }
    } catch { setDialog(true); } finally { setBusy(false); }
  }

  return <>
    <Button type="button" {...props} busy={busy} disabled={busy || props.disabled} onClick={() => void run()}>{children}</Button>
    {changeCv && <Button type="button" variant="link" className="h-auto min-h-11 justify-self-start p-0 text-sm" onClick={() => setDialog(true)}>{th ? 'เปลี่ยน CV' : 'Change CV'}</Button>}
    {dialog && <NewSessionDialog projectId={projectId} job={job} cvName={cvName} onClose={() => setDialog(false)} />}
  </>;
}
