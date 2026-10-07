import type { RunStatus } from '@/lib/api-types';
import { Badge } from './ui/badge';

type Status = RunStatus | 'saved' | 'applied';
type Variant = 'default' | 'secondary' | 'success' | 'warning' | 'danger';

const config: Record<Status, { variant: Variant; th: string; en: string }> = {
  queued: { variant: 'default', th: 'คิวรอ', en: 'Queued' },
  running: { variant: 'default', th: 'กำลังทำงาน', en: 'Running' },
  waiting_approval: { variant: 'warning', th: 'รออนุมัติ', en: 'Needs approval' },
  completed: { variant: 'success', th: 'เสร็จแล้ว', en: 'Completed' },
  failed: { variant: 'danger', th: 'ล้มเหลว', en: 'Failed' },
  cancelled: { variant: 'secondary', th: 'ยกเลิกแล้ว', en: 'Cancelled' },
  interrupted: { variant: 'danger', th: 'หยุดกลางทาง', en: 'Interrupted' },
  saved: { variant: 'secondary', th: 'บันทึกไว้', en: 'Saved' },
  applied: { variant: 'success', th: 'สมัครแล้ว', en: 'Applied' },
};

export function StatusBadge({ status, locale }: { status: Status; locale: 'th' | 'en' }) {
  const { variant, ...labels } = config[status];
  return <Badge variant={variant}>{labels[locale]}</Badge>;
}
