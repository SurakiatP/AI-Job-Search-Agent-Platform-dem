// CR-EVR-01: the evaluation report as sections instead of one Markdown block.
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Minus, PenLine, TriangleAlert, X, MessageCircleQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EvaluationReport, ReportMatch } from '../../lib/api-types';

const ORDER: ReportMatch[] = ['strong', 'partial', 'missing', 'not_applicable'];
const IMPORTANCE = { critical: 0, high: 1, meaningful: 2, preferred: 3, low_signal: 4 } as const;
// Colour backs the written label; it never carries the state alone (DESIGN.md Semantic State Rule).
const TONE: Record<ReportMatch, { icon: typeof Check; chip: string }> = {
  strong: { icon: Check, chip: 'bg-success/15 text-success' },
  partial: { icon: Minus, chip: 'bg-warning/15 text-warning' },
  missing: { icon: X, chip: 'bg-destructive/15 text-destructive' },
  not_applicable: { icon: Minus, chip: 'bg-secondary text-muted-foreground' },
};

function Requirements({ rows }: { rows: NonNullable<EvaluationReport['requirements']> }) {
  const { t } = useTranslation('sessionWorkspace');
  const id = useId();
  const [filter, setFilter] = useState<ReportMatch | 'all'>('all');
  const counts = Object.fromEntries(ORDER.map(m => [m, rows.filter(r => r.match === m).length])) as Record<ReportMatch, number>;
  // Most important first; within a band, unmet before met (Career Ops Block B sort).
  const sorted = [...rows].sort((a, b) => IMPORTANCE[a.importance] - IMPORTANCE[b.importance] || ORDER.indexOf(b.match) - ORDER.indexOf(a.match));
  const shown = filter === 'all' ? sorted : sorted.filter(r => r.match === filter);
  const options: [ReportMatch | 'all', number][] = [['all', rows.length], ...ORDER.filter(m => counts[m] > 0).map(m => [m, counts[m]] as [ReportMatch, number])];
  return <section aria-labelledby={id} className="grid gap-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 id={id} className="text-base font-semibold">{t('report.requirements')}</h3>
      <div role="radiogroup" aria-label={t('report.filter')} className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1">
        {options.map(([value, n]) => <button key={value} type="button" role="radio" aria-checked={filter === value} onClick={() => setFilter(value)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-checked:bg-card aria-checked:text-foreground aria-checked:shadow-sm">
          {t(`report.match.${value}`)}<span className="tabular-nums">{n}</span>
        </button>)}
      </div>
    </div>
    <ul className="grid divide-y rounded-lg border">
      {shown.map((row, i) => {
        const Icon = TONE[row.match].icon;
        return <li key={`${row.requirement}-${i}`} className="grid gap-1.5 px-4 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
          <span className={`inline-flex h-7 items-center gap-1.5 justify-self-start rounded-full px-2.5 text-xs font-semibold ${TONE[row.match].chip}`}>
            <Icon className="size-3.5" aria-hidden="true" />{t(`report.match.${row.match}`)}
          </span>
          <div className="grid min-w-0 gap-0.5">
            <p className="flex flex-wrap items-baseline gap-x-2 break-words font-medium">
              {row.requirement}
              {row.importance === 'critical' && <span className="text-xs font-medium text-primary">{t('report.critical')}</span>}
            </p>
            {row.evidence && <p className="break-words text-sm text-muted-foreground">{row.evidence}</p>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}

function Points({ title, items, icon, children }: { title: string; items?: string[]; icon: ReactNode; children?: ReactNode }) {
  const id = useId();
  if (!items?.length) return null;
  return <section aria-labelledby={id} className="grid content-start gap-2">
    <h3 id={id} className="flex items-center gap-2 text-base font-semibold">{icon}{title}</h3>
    <ul className="grid gap-1.5 text-sm leading-relaxed">
      {items.map(item => <li key={item} className="flex gap-2"><span className="mt-2.5 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" /><span className="min-w-0 break-words">{item}</span></li>)}
    </ul>
    {children}
  </section>;
}

export function EvaluationReportView({ report, onTailor }: { report: EvaluationReport; onTailor?: () => void }) {
  const { t } = useTranslation('sessionWorkspace');
  const icon = 'size-4 shrink-0';
  return <div className="grid gap-6">
    <div className="grid max-w-[70ch] gap-1">
      <p className="text-lg font-semibold leading-snug [text-wrap:balance]">{report.verdict}</p>
      <p className="text-muted-foreground">{report.summary}</p>
    </div>
    {!!report.requirements?.length && <Requirements rows={report.requirements} />}
    <div className="grid gap-6 md:grid-cols-2 md:gap-8">
      <Points title={t('report.strengths')} items={report.strengths} icon={<Check className={`${icon} text-success`} aria-hidden="true" />} />
      <Points title={t('report.risks')} items={report.risks} icon={<TriangleAlert className={`${icon} text-warning`} aria-hidden="true" />} />
      <Points title={t('report.interview')} items={report.interview_prep} icon={<MessageCircleQuestion className={`${icon} text-primary`} aria-hidden="true" />} />
      <Points title={t('report.cvChanges')} items={report.cv_changes} icon={<PenLine className={`${icon} text-primary`} aria-hidden="true" />}>
        {onTailor && <Button variant="outline" size="sm" className="mt-1 justify-self-start" onClick={onTailor}>{t('report.tailor')}</Button>}
      </Points>
    </div>
  </div>;
}
