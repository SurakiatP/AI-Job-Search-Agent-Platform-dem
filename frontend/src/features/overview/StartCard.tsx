import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Search, Upload } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PasteJobDialog } from '@/components/PasteJobDialog';
import { cn } from '@/lib/utils';
import { EvaluateButton } from '../sessions/EvaluateButton';
import { ACCEPT, uploadCvFile } from '../profile/cvUpload';
import { useOverviewCopy } from './copy';

export type StartCardProps = {
  projectId: string;
  cvName?: string;
  hasCv: boolean;
  reading: boolean;
  job?: { id: string; name: string };
  /** Reload CVs, runs and jobs after an upload or a saved posting. */
  onChanged: () => void;
};

// First run only (no fit score yet): ① CV ② job ③ score, with the upload drop zone in place.
export function StartCard({ projectId, cvName, hasCv, reading, job, onChanged }: StartCardProps) {
  const { t } = useTranslation();
  const c = useOverviewCopy().start;
  const base = `/app/projects/${projectId}`;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const cvReady = hasCv && !reading;
  const hasJob = cvReady && !!job;
  const state = [cvReady ? 'done' : 'current', !cvReady ? 'upcoming' : hasJob ? 'done' : 'current', hasJob ? 'current' : 'upcoming'] as const;

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true); setError(null);
    const failure = await uploadCvFile(projectId, file);
    if (failure) setError(failure); else onChanged();
    setBusy(false);
  }

  const body = [
    // 1
    cvReady ? <p className="break-words text-sm text-muted-foreground">{c.cvDone(cvName ?? '')}</p>
      : reading || hasCv ? <p role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{c.reading}</p>
      : <div className="grid gap-3">
        <div onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files[0]); }}
          className={cn('grid justify-items-start gap-3 rounded-2xl border border-dashed p-5 sm:p-6', dragging ? 'border-primary bg-accent' : 'bg-muted/40')}>
          <div className="grid gap-1"><p className="font-medium">{dragging ? c.dropActive : c.dropTitle}</p><p className="text-sm text-muted-foreground">{c.dropHelp}</p></div>
          <Button type="button" busy={busy} disabled={busy} onClick={() => input.current?.click()}><Upload className="size-4" aria-hidden="true" />{c.pick}</Button>
          <input ref={input} hidden tabIndex={-1} aria-label={c.pick} type="file" accept={ACCEPT} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
        </div>
        {busy && <p role="status" className="text-sm text-muted-foreground">{c.uploading}</p>}
        {error && <Alert severity="error" role="alert">{t(error)}</Alert>}
      </div>,
    // 2
    hasJob ? <p className="break-words text-sm text-muted-foreground">{c.jobDone(job.name)}</p>
      : cvReady ? <div className="grid justify-items-start gap-3"><p className="text-sm text-muted-foreground">{c.pickHelp}</p>
        <div className="flex flex-wrap gap-2"><Button asChild><Link to={`${base}/search`}><Search className="size-4" aria-hidden="true" />{c.search}</Link></Button><Button type="button" variant="outline" onClick={() => setPaste(true)}>{c.paste}</Button></div></div>
        : null,
    // 3
    hasJob ? <div className="grid justify-items-start gap-3"><p className="break-words text-sm text-muted-foreground">{c.scoreHelp(job.name, cvName)}</p><EvaluateButton projectId={projectId} job={{ savedId: job.id }}>{c.score}</EvaluateButton></div> : null,
  ];

  return <section aria-labelledby="start-heading" className="grid gap-5 rounded-3xl border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
    <div className="grid gap-1"><h2 id="start-heading" className="break-words text-3xl font-semibold tracking-tight">{c.title}</h2><p className="max-w-2xl break-words text-muted-foreground">{c.body}</p></div>
    <ol aria-label={c.label} className="grid gap-5">{c.steps.map((name, i) => <li key={name} aria-current={state[i] === 'current' ? 'step' : undefined} className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-2">
      <span aria-hidden="true" className={cn('grid size-8 place-items-center rounded-full text-sm font-semibold', state[i] === 'current' && 'bg-primary-fill text-primary-fill-foreground', state[i] === 'done' && 'border border-success text-success', state[i] === 'upcoming' && 'bg-muted text-muted-foreground')}>{state[i] === 'done' ? <Check className="size-4" /> : i + 1}</span>
      <h3 className={cn('self-center font-semibold', state[i] === 'upcoming' && 'text-muted-foreground')}>{name}<span className="sr-only"> ({c[state[i]]})</span></h3>
      {body[i] && <div className="col-start-2 min-w-0">{body[i]}</div>}
    </li>)}</ol>
    {paste && <PasteJobDialog projectId={projectId} onClose={() => setPaste(false)} onSaved={onChanged} />}
  </section>;
}
