import type { ApplicationStage, RunStatus } from '@/lib/api-types';
import { stageLabel } from '@/lib/applicationStages';
import { Badge } from './ui/badge';
import { Spinner } from './ui/spinner';

type Status = RunStatus | ApplicationStage;
type Variant = 'default' | 'secondary' | 'success' | 'warning' | 'danger';

const stageVariant: Record<ApplicationStage, Variant> = { saved: 'secondary', applied: 'success', responded: 'success', interview: 'success', offer: 'success', hired: 'success', rejected: 'danger', withdrawn: 'secondary' };

const config: Record<Status, { variant: Variant; th: string; en: string }> = {
  queued: { variant: 'default', th: 'คิวรอ', en: 'Queued' },
  running: { variant: 'default', th: 'กำลังทำงาน', en: 'Running' },
  waiting_approval: { variant: 'warning', th: 'รออนุมัติ', en: 'Needs approval' },
  needs_input: { variant: 'warning', th: 'รอข้อมูลจากคุณ', en: 'Needs input' },
  completed: { variant: 'success', th: 'เสร็จแล้ว', en: 'Completed' },
  failed: { variant: 'danger', th: 'ล้มเหลว', en: 'Failed' },
  cancelled: { variant: 'secondary', th: 'ยกเลิกแล้ว', en: 'Cancelled' },
  interrupted: { variant: 'danger', th: 'หยุดกลางทาง', en: 'Interrupted' },
  ...Object.fromEntries((Object.keys(stageLabel) as ApplicationStage[]).map(stage => [stage, { variant: stageVariant[stage], ...stageLabel[stage] }])) as Record<ApplicationStage, { variant: Variant; th: string; en: string }>,
};

export function StatusBadge({ status, locale }: { status: Status; locale: 'th' | 'en' }) {
  const { variant, ...labels } = config[status];
  const working = status === 'queued' || status === 'running';
  return <Badge variant={variant} className={working ? 'gap-1.5' : undefined}>{working && <Spinner className="size-3" />}{labels[locale]}</Badge>;
}
