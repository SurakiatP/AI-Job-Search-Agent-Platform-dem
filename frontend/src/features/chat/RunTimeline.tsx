import { useTranslation } from 'react-i18next';
import { Progress } from '@/components/ui/progress';
import { BusyNote } from '@/components/BusyNote';
import { StatusBadge } from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import { relativeTime } from '../console/shared';
import { RunSteps } from './RunSteps';
import type { Locale, RunEvent, RunStatus, RunView } from '../../lib/api-types';

const statuses: Record<Locale, Record<RunStatus, string>> = {
  th: { queued: 'เข้าคิวแล้ว', running: 'กำลังทำงาน', waiting_approval: 'รอการอนุมัติ', needs_input: 'รอข้อมูลจากคุณ', completed: 'เสร็จแล้ว', failed: 'ทำไม่สำเร็จ', cancelled: 'ยกเลิกแล้ว', interrupted: 'หยุดกลางคัน' },
  en: { queued: 'Queued', running: 'Running', waiting_approval: 'Waiting for approval', needs_input: 'Needs input', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted' },
};

export function RunTimeline({ locale, run, events, cancellationPending, historical = false }: { locale: Locale; run: RunView | null; events: RunEvent[]; cancellationPending?: boolean; historical?: boolean }) {
  const { t: translate } = useTranslation();
  if (!run) return null;
  const t = statuses[locale];
  const title = locale === 'th' ? 'สถานะงาน' : 'Run status';
  const headingId = historical ? `run-history-heading-${run.id}` : 'run-status-heading';
  const operation = translate(`workspace.operations.${run.operation}`, { defaultValue: locale === 'th' ? 'งานเอเจนต์' : 'Agent task' });
  const cancelText = locale === 'th' ? 'กำลังรอผลยืนยันการหยุด' : 'Waiting for cancellation confirmation';
  const progress = events.length ? events[events.length - 1].data.progress_percent : null;
  const working = !historical && (run.status === 'queued' || run.status === 'running');
  const hasPercent = progress !== null && progress !== undefined;
  const busyLabel = run.status === 'queued' ? (locale === 'th' ? `เข้าคิวแล้ว: ${operation}` : `Queued: ${operation}`) : (locale === 'th' ? `กำลังทำงาน: ${operation}` : `Working on: ${operation}`);
  const busyDetail = locale === 'th' ? 'หน้านี้อัปเดตเองเมื่อมีความคืบหน้า ไม่ต้องรีเฟรช' : 'This page updates by itself as work progresses, no need to refresh';
  return <section aria-labelledby={headingId} className="grid gap-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{title}</p><h3 id={headingId} className="break-words text-base font-semibold">{operation}</h3></div>
      <span aria-hidden="true"><StatusBadge status={run.status} locale={locale} /></span>
    </div>
    {working && <BusyNote announce={false} locale={locale} label={busyLabel} detail={busyDetail} bar={!hasPercent} />}
    <p className={cn('text-sm', !cancellationPending && 'sr-only')} data-testid={historical ? undefined : 'run-status'} role="status">{t[run.status]}{cancellationPending ? ` · ${cancelText}` : ''}</p>
    <p className="text-xs text-muted-foreground"><time dateTime={run.created_at}>{relativeTime(run.created_at, Date.now(), locale)}</time></p>
    {progress !== null && progress !== undefined && <div className="flex items-center gap-3"><Progress value={progress} className="flex-1" /><span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{progress}%</span></div>}
    <RunSteps events={events} locale={locale} status={run.status} />
  </section>;
}
