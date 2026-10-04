import { useTranslation } from 'react-i18next';
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
  const cancelText = locale === 'th' ? 'กำลังรอผลยืนยันการหยุด' : 'Waiting for cancellation confirmation';
  return <section className="surface-card" aria-labelledby="run-status-heading">
    <h2 id="run-status-heading">{title}</h2>
    <p data-testid="run-status" role="status">{t[run.status]}{cancellationPending ? ` · ${cancelText}` : ''}</p>
    <p className="muted" data-testid="run-id">{run.id}</p>
    <ol aria-label={locale === 'th' ? 'ความคืบหน้า' : 'Progress'}>
      {events.map(event => <li key={`${run.id}:${event.sequence}`}>
        {event.data.step ?? (event.data.message_key ? translate(event.data.message_key, { defaultValue: locale === 'th' ? 'อัปเดตสถานะ' : 'Status updated' }) : event.event_type)}
        {event.data.progress_percent !== null && event.data.progress_percent !== undefined ? ` · ${event.data.progress_percent}%` : ''}
      </li>)}
    </ol>
  </section>;
}
