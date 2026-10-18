import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import type { ApprovalView, Locale, RunEvent, RunOperation, RunView } from '../../lib/api-types';
import { ApprovalCard } from './ApprovalCard';
import { RunTimeline } from './RunTimeline';

const STEPS: RunOperation[] = ['evaluate_job', 'tailor_cv', 'draft_documents', 'apply_prepare'];
export type PrimaryAction = { label: string; onClick: () => void; disabled?: boolean; title?: string };

// The one place that owns the primary action for the current run state; tab content keeps only quiet buttons.
export function WorkflowPanel({ locale, sessionRuns, run, events, cancellationPending, approval, approvalBusy, onDecision, onRefresh, error, primary, hint, needsInput, canCancel, cancelDisabled, onCancel, activityHref, className }: {
  locale: Locale; sessionRuns: RunView[]; run: RunView | null; events: RunEvent[]; cancellationPending?: boolean;
  approval: ApprovalView | null; approvalBusy: boolean; onDecision: (id: string, decision: 'approve' | 'reject') => void; onRefresh: () => void;
  error: string | null; primary: PrimaryAction | null; hint?: string; needsInput: boolean; canCancel: boolean; cancelDisabled: boolean; onCancel: () => void; activityHref: string; className?: string;
}) {
  const { t } = useTranslation('sessionWorkspace');
  // Runs are newest first; the first run of an operation is its latest.
  const latest = (operation: RunOperation) => sessionRuns.find(item => item.operation === operation);
  return <aside aria-labelledby="workflow-heading" className={cn('grid min-w-0 content-start gap-4 rounded-xl border bg-card p-4 sm:p-5', className)}>
    <h2 id="workflow-heading" className="text-lg font-semibold">{t('panel.title')}</h2>
    <ol className="grid gap-3" aria-label={t('panel.steps')}>
      {STEPS.map(operation => {
        const step = latest(operation);
        return <li key={operation} className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="break-words text-sm font-medium">{t(`panel.ops.${operation}`)}</p><p className="break-words text-xs text-muted-foreground">{t(`panel.hints.${operation}`)}</p></div>
          {step ? <StatusBadge status={step.status} locale={locale} /> : <Badge variant="outline" className="shrink-0 text-muted-foreground">{t('panel.notStarted')}</Badge>}
        </li>;
      })}
    </ol>
    {run && <div className="grid gap-3 border-t pt-4"><RunTimeline locale={locale} run={run} events={events} cancellationPending={cancellationPending} /></div>}
    {needsInput && <p role="status" className="rounded-lg border border-warning/60 bg-warning/10 p-3 text-sm font-medium">{t('run.needsInput')}</p>}
    {error && <p className="flex flex-wrap items-center gap-3 text-sm text-destructive" role="alert"><span className="min-w-0 break-words">{t(error, { defaultValue: t('pages.loadError') })}</span><Button type="button" variant="outline" size="sm" onClick={onRefresh}>{t('refresh')}</Button></p>}
    <ApprovalCard approval={approval} locale={locale} busy={approvalBusy} onDecision={onDecision} onRefresh={onRefresh} />
    {(primary || canCancel) && <div className="grid gap-2">
      {primary && <Button type="button" className="w-full whitespace-normal" disabled={primary.disabled} title={primary.title} onClick={primary.onClick}>{primary.label}</Button>}
      {primary && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {canCancel && <Button type="button" variant="outline" className="w-full" disabled={cancelDisabled} onClick={onCancel}>{t('cancel')}</Button>}
    </div>}
    <Link to={activityHref} className="flex min-h-11 items-center justify-between gap-2 border-t pt-2 text-sm text-primary hover:underline">{t('panel.openActivity')}<ChevronRight className="size-4 shrink-0" aria-hidden="true" /></Link>
  </aside>;
}
