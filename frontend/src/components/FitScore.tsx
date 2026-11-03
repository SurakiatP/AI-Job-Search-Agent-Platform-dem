import { cn } from '@/lib/utils';
import type { EvaluationResult } from '@/lib/api-types';

export type FitInput = Pick<EvaluationResult, 'score' | 'score_percent' | 'score_band' | 'score_basis'> | null | undefined;
type Locale = 'th' | 'en';

const BAND_TEXT = {
  strong: { th: 'เหมาะมาก', en: 'Strong fit' }, good: { th: 'เหมาะ', en: 'Good fit' }, partial: { th: 'เหมาะบางส่วน', en: 'Partial fit' },
  weak: { th: 'เหมาะน้อย', en: 'Weak fit' }, poor: { th: 'ไม่ค่อยเหมาะ', en: 'Poor fit' },
} as const;
const BAND_COLOR = { strong: 'text-success', good: 'text-success', partial: 'text-warning', weak: 'text-destructive', poor: 'text-destructive' } as const;

export const fitBandText = (band: keyof typeof BAND_TEXT, locale: Locale) => BAND_TEXT[band][locale];

/** 'percent' = new rubric result; 'legacy' = a stored 1-5 score (never converted); 'none' = nothing to show. */
export function fitKind(result: FitInput): 'percent' | 'legacy' | 'none' {
  if (result?.score_percent != null) return 'percent';
  return result?.score != null ? 'legacy' : 'none';
}

export function FitScore({ result, size = 'sm', locale }: { result: FitInput; size?: 'sm' | 'lg'; locale: Locale }) {
  const kind = fitKind(result);
  const band = kind === 'percent' ? result?.score_band ?? null : null;
  const prefix = locale === 'th' ? 'คะแนนความเหมาะสม' : 'Fit score';
  const value = kind === 'percent' ? `${result!.score_percent}%` : kind === 'legacy' ? `${result!.score!.toFixed(1)}/5` : '—';
  const old = locale === 'th' ? 'มาตราเก่า' : 'old scale';
  const label = kind === 'none' ? (locale === 'th' ? 'ยังไม่มีคะแนน' : 'No score') : `${value}${band ? `, ${fitBandText(band, locale)}` : ''}${kind === 'legacy' ? `, ${old}` : ''}`;
  return <div className={cn('inline-flex shrink-0 flex-wrap items-baseline gap-x-2 rounded-lg border border-[color:var(--border-strong)] bg-card px-3 py-1 tabular-nums', band ? BAND_COLOR[band] : 'text-muted-foreground')} role="img" aria-label={`${prefix}: ${label}`}>
    <span aria-hidden="true" className={cn('font-semibold', size === 'lg' ? 'text-3xl' : 'text-base')}>{value}</span>
    {band && <span aria-hidden="true" className="text-sm font-medium">{fitBandText(band, locale)}</span>}
    {kind === 'legacy' && <span aria-hidden="true" className="text-xs text-muted-foreground">{old}</span>}
  </div>;
}

export function scoreBasisText(basis: NonNullable<EvaluationResult['score_basis']>, locale: Locale) {
  const th = locale === 'th';
  const parts = [`${th ? 'ตรง' : 'Strong'} ${basis.strong}`, `${th ? 'ตรงบางส่วน' : 'Partial'} ${basis.partial}`, `${th ? 'ไม่พบ' : 'Missing'} ${basis.missing}`];
  if (basis.not_applicable) parts.push(`${th ? 'ไม่เกี่ยวข้อง (ไม่นับ)' : 'Not applicable (not counted)'} ${basis.not_applicable}`);
  return parts.join(' · ');
}

/** One control: the rubric and the breakdown behind a percent. Nothing is shown for legacy or missing scores. */
export function FitScoreWhy({ result, locale }: { result: FitInput; locale: Locale }) {
  if (fitKind(result) !== 'percent') return null;
  const th = locale === 'th';
  const basis = result!.score_basis;
  return <details className="group max-w-prose text-sm" data-testid="fit-score-why">
    <summary className="flex min-h-11 cursor-pointer list-none items-center text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">{th ? 'คำนวณคะแนนอย่างไร' : 'How the score is calculated'}</summary>
    <div className="grid gap-2 pb-2 text-muted-foreground">
      <p>{th ? 'AI ตัดสินแต่ละข้อกำหนดของงานเทียบกับ CV แล้วระบบคำนวณตัวเลขตามสูตรที่เขียนไว้ ข้อเดียวกันได้ตัวเลขเดิมเสมอ' : 'The AI judges each job requirement against your CV. The platform then computes the number from a written formula, so the same judgments always give the same number.'}</p>
      <p>{th ? 'น้ำหนักตามความสำคัญ: สำคัญมาก 5 · สูง 3 · ปานกลาง 2 · ที่ควรมี 1 · ข้อความทั่วไป 0.5. คะแนนต่อข้อ: ตรง 100% · ตรงบางส่วน 50% · ไม่พบ 0%.' : 'Weight by importance: critical 5 · high 3 · meaningful 2 · preferred 1 · low signal 0.5. Credit per row: strong 100% · partial 50% · missing 0%.'}</p>
      <p>{th ? 'ถ้าขาดข้อกำหนดสำคัญมากแม้ข้อเดียว คะแนนไม่เกิน 59%. ช่วง: 80-100 เหมาะมาก · 60-79 เหมาะ · 40-59 เหมาะบางส่วน · 20-39 เหมาะน้อย · 0-19 ไม่ค่อยเหมาะ' : 'One missing critical requirement caps the score at 59%. Bands: 80-100 strong · 60-79 good · 40-59 partial · 20-39 weak · 0-19 poor.'}</p>
      {basis && <p className="font-medium text-foreground" data-testid="fit-score-basis">{scoreBasisText(basis, locale)}{basis.capped ? (th ? ' · จำกัดที่ 59% เพราะขาดข้อกำหนดสำคัญมาก' : ' · capped at 59%: a critical requirement is missing') : ''}</p>}
    </div>
  </details>;
}
