import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { StatusBadge } from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import type { Locale, RunEvent, RunStatus, RunView } from '../../lib/api-types';

const statuses: Record<Locale, Record<RunStatus, string>> = {
  th: { queued: 'เข้าคิวแล้ว', running: 'กำลังทำงาน', waiting_approval: 'รอการอนุมัติ', completed: 'เสร็จแล้ว', failed: 'ทำไม่สำเร็จ', cancelled: 'ยกเลิกแล้ว', interrupted: 'หยุดกลางคัน' },
  en: { queued: 'Queued', running: 'Running', waiting_approval: 'Waiting for approval', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted' },
};

export function RunTimeline({ locale, run, events, cancellationPending }: { locale: Locale; run: RunView | null; events: RunEvent[]; cancellationPending?: boolean }) {
  const { t: translate } = useTranslation();
  if (!run) return null;
  const t = statuses[locale];
  const title = locale === 'th' ? 'สถานะงาน' : 'Run status';
  const operation = run.operation === 'evaluate_job' ? (locale === 'th' ? 'ประเมินงาน' : 'Evaluating job') : (locale === 'th' ? 'ร่างเอกสาร' : 'Drafting documents');
  const cancelText = locale === 'th' ? 'กำลังรอผลยืนยันการหยุด' : 'Waiting for cancellation confirmation';
  const progress = events.length ? events[events.length - 1].data.progress_percent : null;
  return <Card aria-labelledby="run-status-heading" role="region">
    <CardHeader className="gap-2 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-xs text-muted-foreground">{title}</p><CardTitle id="run-status-heading" className="break-words text-lg">{operation}</CardTitle></div>
        <span aria-hidden="true"><StatusBadge status={run.status} locale={locale} /></span>
      </div>
      <p className="text-sm" data-testid="run-status" role="status">{t[run.status]}{cancellationPending ? ` · ${cancelText}` : ''}</p>
      <p className="break-all text-xs text-muted-foreground" data-testid="run-id">{run.id}</p>
    </CardHeader>
    <CardContent className="grid gap-4">
      {progress !== null && progress !== undefined && <div className="flex items-center gap-3"><Progress value={progress} className="flex-1" /><span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{progress}%</span></div>}
      {events.length > 0 && <ol className="grid gap-3" aria-label={locale === 'th' ? 'ความคืบหน้า' : 'Progress'}>
        {events.map((event, index) => <li key={`${run.id}:${event.sequence}`} className="flex items-start gap-3 text-sm">
          <span aria-hidden="true" className={cn('mt-2 size-2 shrink-0 rounded-full', index === events.length - 1 ? 'bg-primary ring-4 ring-primary/20' : 'bg-muted-foreground/40')} />
          <span className={cn('min-w-0 break-words', index === events.length - 1 ? 'font-medium' : 'text-muted-foreground')}>
            {event.data.step ?? (event.data.message_key ? translate(event.data.message_key, { defaultValue: locale === 'th' ? 'อัปเดตสถานะ' : 'Status updated' }) : event.event_type)}
          </span>
        </li>)}
      </ol>}
    </CardContent>
  </Card>;
}
