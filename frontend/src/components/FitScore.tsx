import { cn } from '@/lib/utils';

export function fitBand(score: number | null) {
  if (score === null) return 'none';
  if (score >= 4) return 'success';
  if (score >= 2.5) return 'warning';
  return 'danger';
}

const stroke = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--destructive)', none: 'var(--border)' } as const;

export function FitScore({ score, size = 'sm', locale }: { score: number | null; size?: 'sm' | 'lg'; locale: 'th' | 'en' }) {
  const band = fitBand(score);
  const dimension = size === 'lg' ? 112 : 56;
  const radius = dimension / 2 - (size === 'lg' ? 8 : 5);
  const circumference = 2 * Math.PI * radius;
  const ratio = score === null ? 0 : Math.max(0, Math.min(score, 5)) / 5;
  const label = score === null ? (locale === 'th' ? 'ยังไม่มีคะแนน' : 'No score') : `${score.toFixed(1)} / 5`;
  return <div className="inline-flex flex-col items-center gap-1" role="img" aria-label={`${locale === 'th' ? 'คะแนนความเหมาะสม' : 'Fit score'}: ${label}`}>
    <div className="relative" style={{ width: dimension, height: dimension }}>
      <svg width={dimension} height={dimension} viewBox={`0 0 ${dimension} ${dimension}`} className="-rotate-90" aria-hidden="true">
        <circle cx={dimension / 2} cy={dimension / 2} r={radius} fill="none" stroke="var(--muted)" strokeWidth={size === 'lg' ? 10 : 6} />
        <circle className="fit-ring" cx={dimension / 2} cy={dimension / 2} r={radius} fill="none" stroke={stroke[band]} strokeWidth={size === 'lg' ? 10 : 6} strokeLinecap="round"
          strokeDasharray={circumference} style={{ ['--ring-circumference' as string]: `${circumference}`, strokeDashoffset: circumference * (1 - ratio) }} />
      </svg>
      <span className={cn('absolute inset-0 grid place-items-center font-semibold tabular-nums', size === 'lg' ? 'text-2xl' : 'text-sm')}>{score === null ? '—' : score.toFixed(1)}</span>
    </div>
    {size === 'lg' && <span className="text-sm text-muted-foreground">{label}</span>}
  </div>;
}
