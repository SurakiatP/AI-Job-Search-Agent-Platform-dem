// CR-EVR-01: the evaluation report as sections instead of one Markdown block.
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Minus, PenLine, TriangleAlert, X, MessageCircleQuestion } from 'lucide-react';
import type { EvaluationReport, ReportMatch } from '../../lib/api-types';
import { AiLabel } from '@/components/AiMark';

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
          className="inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-checked:bg-card aria-checked:text-foreground">
          {t(`report.match.${value}`)}<span className="tabular-nums">{n}</span>
        </button>)}
      </div>
    </div>
    <ul className="grid divide-y overflow-hidden rounded-2xl bg-muted">
      {shown.map((row, i) => {
        const Icon = TONE[row.match].icon;
        return <li key={`${row.requirement}-${i}`} className="grid gap-2 px-4 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
          <span className={`inline-flex min-h-7 items-center gap-1 self-start justify-self-start rounded-full px-3 text-xs font-semibold ${TONE[row.match].chip}`}>
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

function Points({ title, items, icon, tone }: { title: string; items?: string[]; icon: ReactNode; tone: string }) {
  const id = useId();
  if (!items?.length) return null;
  return <section aria-labelledby={id} className={`grid content-start gap-3 rounded-2xl p-5 ${tone}`}>
    <h3 id={id} className="flex items-center gap-2 text-base font-semibold">{icon}{title}</h3>
    <ul className="grid gap-2 text-sm leading-relaxed">
      {items.map(item => <li key={item} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" /><span className="min-w-0 break-words">{item}</span></li>)}
    </ul>
  </section>;
}

/** One list from the latest evaluation, shown as its own card on the tab where it is used. */
export function ReportListCard({ kind, items, title, hint }: { kind: 'interview' | 'cvChanges'; items?: string[]; title?: string; hint?: string }) {
  const { t } = useTranslation('sessionWorkspace');
  const id = useId();
  if (!items?.length) return null;
  const Icon = kind === 'interview' ? MessageCircleQuestion : PenLine;
  return <section aria-labelledby={id} className="grid gap-3 rounded-xl border bg-card p-5 sm:p-6">
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="flex items-center gap-2 text-lg font-semibold"><Icon className="size-5 shrink-0 text-ai" aria-hidden="true" />{title ?? t(`report.${kind}`)}</h2>
        <AiLabel />
      </div>
      <p className="text-sm text-muted-foreground">{hint ?? t(`report.${kind}Hint`)}</p>
    </div>
    <ol className="grid max-w-[75ch] gap-2">
      {items.map((item, i) => <li key={item} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2 leading-relaxed">
        <span className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full bg-ai-soft text-xs font-semibold tabular-nums text-ai-foreground" aria-hidden="true">{i + 1}</span>
        <span className="min-w-0 break-words">{item}</span>
      </li>)}
    </ol>
  </section>;
}

export function EvaluationReportView({ report, score, extra }: { report: EvaluationReport; score?: ReactNode; extra?: ReactNode }) {
  const { t } = useTranslation('sessionWorkspace');
  const icon = 'size-4 shrink-0';
  return <div className="grid gap-6" data-testid="ai-report">
    <div className={`gem-border grid gap-4 rounded-3xl [--gem-fill:color-mix(in_srgb,var(--ai-soft)_55%,var(--card))] p-5 sm:p-6 lg:gap-x-8 lg:p-8 ${score ? 'lg:grid-cols-[auto_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'}`}>
      <AiLabel className="lg:col-span-2" />
      {score}
      <div className="grid min-w-0 content-start gap-3">
        <p className="break-words text-xl font-semibold leading-snug [text-wrap:balance] lg:text-2xl">{report.verdict}</p>
        <p className="max-w-[75ch] break-words text-muted-foreground">{report.summary}</p>
      </div>
    </div>
    {extra}
    {!!report.requirements?.length && <Requirements rows={report.requirements} />}
    <div className="grid gap-4 md:grid-cols-2 md:gap-6">
      <Points title={t('report.strengths')} items={report.strengths} tone="bg-success/8" icon={<Check className={`${icon} text-success`} aria-hidden="true" />} />
      <Points title={t('report.risks')} items={report.risks} tone="bg-warning/8" icon={<TriangleAlert className={`${icon} text-warning`} aria-hidden="true" />} />
    </div>
  </div>;
}
