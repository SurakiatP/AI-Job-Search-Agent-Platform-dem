import { cn } from '@/lib/utils';

export function fitBand(score: number | null) {
  if (score === null) return 'none';
  if (score >= 4) return 'success';
  if (score >= 2.5) return 'warning';
  return 'danger';
}

export function FitScore({ score, size = 'sm', locale }: { score: number | null; size?: 'sm' | 'lg'; locale: 'th' | 'en' }) {
  const label = score === null ? (locale === 'th' ? 'ยังไม่มีคะแนน' : 'No score') : `${score.toFixed(1)} / 5`;
  const color = { success: 'text-success', warning: 'text-warning', danger: 'text-destructive', none: 'text-muted-foreground' }[fitBand(score)];
  return <div className={cn('inline-flex shrink-0 items-baseline gap-1.5 tabular-nums', color)} role="img" aria-label={`${locale === 'th' ? 'คะแนนความเหมาะสม' : 'Fit score'}: ${label}`}>
    <span className={cn('font-semibold', size === 'lg' ? 'text-3xl' : 'text-base')}>{score === null ? '—' : score.toFixed(1)}</span>
    {score !== null && <span className="text-sm text-muted-foreground">/ 5</span>}
  </div>;
}
