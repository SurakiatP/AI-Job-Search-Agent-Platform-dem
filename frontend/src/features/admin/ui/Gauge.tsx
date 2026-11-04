import { cn } from '@/lib/utils';
import { CountUp, useDrawn } from './motion';

export interface GaugeProps {
  /** 0..100 */
  value: number;
  /** 0..100, drawn as a longer dark tick. */
  target: number;
  /** Text under the number ("Target 90%, 4% short"). */
  caption: string;
  /** Text alternative with value and target. */
  ariaLabel: string;
  animateKey?: string | number;
  className?: string;
}

const N = 40;
const CX = 120;
const CY = 120;

/** Half-circle of 40 ticks: ticks up to the value light up one after another; the target is a long dark tick. */
export function Gauge({ value, target, caption, ariaLabel, animateKey, className }: GaugeProps) {
  const drawn = useDrawn(animateKey);
  const lit = Math.round((Math.max(0, Math.min(100, value)) / 100) * N);
  const tg = Math.round((Math.max(0, Math.min(100, target)) / 100) * (N - 1));
  return <div role="img" aria-label={ariaLabel} className={cn('relative grid justify-items-center', className)}>
    <svg viewBox="0 0 240 132" aria-hidden="true" className="h-auto w-full max-w-[280px] overflow-visible">
      {Array.from({ length: N }, (_, i) => {
        const a = Math.PI * (1 - i / (N - 1));
        const isT = i === tg;
        const r1 = isT ? 78 : 86;
        const on = i < lit && !isT && drawn;
        return <line key={i} x1={CX + r1 * Math.cos(a)} y1={CY - r1 * Math.sin(a)} x2={CX + 108 * Math.cos(a)} y2={CY - 108 * Math.sin(a)} strokeLinecap="round"
          strokeWidth={isT ? 2.5 : 4} className={isT ? 'stroke-foreground' : on ? 'stroke-success' : 'stroke-border'}
          style={{ transition: `stroke 50ms linear ${on ? 200 + i * 18 : 0}ms` }} />;
      })}
    </svg>
    <div className="absolute bottom-[34px] text-center" aria-hidden="true">
      <b className="block text-[34px] font-semibold leading-none tracking-tight tabular-nums"><CountUp value={value} format={n => `${Math.round(n)}%`} /></b>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </div>
  </div>;
}
