import type { CSSProperties, ReactNode } from 'react';
import { Bell, Check, ClipboardList, Clock, Download, FileText, FileUser, Search, Sparkles } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { FitScore } from '../../components/FitScore';
import { SkillCoverage } from '../../components/SkillCoverage';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { cn } from '@/lib/utils';
import { stageLabel } from '../../lib/applicationStages';
import { landingCopy, previewCopy } from './copy';
import { featureSlugs } from './featurePages';
import { Tick, useSeen } from './Reveal';

const coverage = {
  required: ['React', 'TypeScript', 'Tailwind', 'Git', 'REST', 'Vite', 'Jest', 'Playwright', 'Docker', 'CI/CD', 'GraphQL', 'Next.js', 'AWS', 'Figma'],
  matched: ['React', 'TypeScript', 'Tailwind', 'Git', 'REST', 'Vite'],
  missing: ['Jest', 'Playwright', 'Docker', 'CI/CD', 'GraphQL', 'Next.js', 'AWS', 'Figma'],
  ratio: 6 / 14,
  method: 'keyword',
};

function Shell({ label, children }: { label: string; children: ReactNode }) {
  const { locale } = useLocale();
  return <div className="grid min-w-0 gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3"><span className="min-w-0 text-sm font-semibold">{label}</span><Badge variant="outline" className="shrink-0">{landingCopy[locale].panel.sample}</Badge></div>
      {children}
  </div>;
}

const row = 'grid min-w-0 gap-2 rounded-xl border bg-background/60 p-3';

/** Product panel for tour step `index`, built from the app's own components with sample data. */
export function StepPanel({ index }: { index: number }) {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  const p = previewCopy[locale];
  const pn = c.panel;
  const label = pn.labels[index];
  const slug = featureSlugs[index];
  if (slug === 'add-cv') return <Shell label={label}>
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-dashed bg-background/60 p-3">
      <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><FileText aria-hidden="true" size={20} /></span>
      <div className="min-w-0"><p className="truncate font-medium">my-cv.pdf</p><p className="text-sm text-muted-foreground">{pn.cvMeta}</p></div>
      <Badge variant="success">{pn.ready}</Badge>
    </div>
    <div className="grid gap-2"><p className="text-sm text-muted-foreground">{pn.parsed}</p>
      <ul className="flex flex-wrap gap-1.5">{pn.skills.map(s => <li key={s}><Badge variant="secondary">{s}</Badge></li>)}</ul></div>
  </Shell>;
  if (slug === 'search') return <Shell label={label}>
    <div className="flex min-h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-base"><Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="sr-only">{pn.searchLabel}: </span><span className="truncate">{pn.searchValue}</span></div>
    <ul className="grid gap-3">{p.jobs.map((j, i) => <li key={j.title} className={cn(row, i === 0 && 'border-primary bg-accent')}>
      <span className="font-semibold leading-snug">{j.title}</span>
      <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{j.company} · {j.place}</span>
      <span className="flex flex-wrap gap-2"><Badge variant="outline">{j.age}</Badge>{j.stale && <Badge variant="warning" className="gap-1"><Clock className="size-3" aria-hidden="true" />{p.staleLabel}</Badge>}</span>
    </li>)}</ul>
  </Shell>;
  if (slug === 'evaluate') return <Shell label={label}>
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
      <FitScore score={4.2} size="lg" locale={locale} />
      <ul className="grid gap-1.5 pl-4 text-sm text-muted-foreground [overflow-wrap:anywhere]">{p.reasons.map(r => <li className="list-disc" key={r}>{r}</li>)}</ul>
    </div>
    <SkillCoverage coverage={coverage} locale={locale} className="border-t pt-4" />
  </Shell>;
  if (slug === 'draft') return <Shell label={label}>
    <div className="grid gap-3 rounded-xl border bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{pn.letterTitle}</span><Badge variant="secondary">{pn.letterRev}</Badge></div>
      <p className="text-sm">{pn.letterGreeting}</p>
      {['w-full', 'w-11/12', 'w-full', 'w-3/5'].map((w, i) => <span key={i} className={cn('h-2 rounded-full bg-muted', w)} />)}
    </div>
    <Button variant="outline" className="w-fit" disabled><Download aria-hidden="true" size={16} />{p.download}</Button>
  </Shell>;
  if (slug === 'build-cv') return <Shell label={label}>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
      <div className="grid content-start gap-3">
        <div className="grid gap-1.5"><span className="text-sm text-muted-foreground">{pn.build.tpl}</span>
          <ul className="flex flex-wrap gap-1.5">{['Onyx', 'Kakuna', 'Lotus', 'Teak'].map((t, i) => <li key={t}><Badge variant={i === 2 ? 'default' : 'outline'}>{t}</Badge></li>)}</ul></div>
        <div className="grid gap-1.5"><span className="text-sm text-muted-foreground">{pn.build.accent}</span>
          <ul className="flex gap-2">{['#3730A3', '#1D4ED8', '#115E59', '#166534', '#9F1239', '#334155'].map((h, i) => <li key={h} aria-hidden="true" className={cn('size-6 rounded-full', i === 2 && 'ring-2 ring-ring ring-offset-2 ring-offset-card')} style={{ background: h }} />)}</ul></div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Check className="size-4 text-success" aria-hidden="true" />{pn.build.saved}</p>
      </div>
      <div className="grid gap-2 rounded-lg border bg-background p-3 shadow-sm">
        <span className="text-xs text-muted-foreground">{pn.build.preview}</span>
        <div className="grid gap-1 border-b-2 pb-2" style={{ borderColor: '#115E59' }}><span className="text-sm font-semibold">{pn.build.name}</span><span className="text-xs text-muted-foreground">{pn.build.headline}</span></div>
        {pn.build.sections.map(s => <div key={s} className="grid gap-1"><span className="text-xs font-semibold" style={{ color: '#115E59' }}>{s}</span><span className="h-1.5 w-full rounded-full bg-muted" /><span className="h-1.5 w-4/5 rounded-full bg-muted" /></div>)}
      </div>
    </div>
  </Shell>;
  if (slug === 'practice') return <Shell label={label}>
    <div className="grid gap-3 rounded-xl border bg-background/60 p-3">
      <Badge variant="secondary" className="w-fit">{pn.practice.section}</Badge>
      <p className="font-medium leading-snug">{pn.practice.question}</p>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">{pn.practice.star.map(([k, name, found]) => <li key={k} className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs', !found && 'border-dashed text-muted-foreground')}><span className="font-semibold">{k}</span><span className="min-w-0 truncate">{found ? name : pn.practice.missing}</span></li>)}</ul>
    </div>
    <div className="grid gap-2">
      <p className="text-sm font-semibold">{pn.practice.feedback}</p>
      <ul className="grid gap-1 text-sm">{pn.practice.dims.map(([d, n]) => <li key={d} className="flex justify-between gap-3"><span className="text-muted-foreground">{d}</span><span className="tabular-nums">{n} {pn.practice.of}</span></li>)}</ul>
      <p className="text-sm text-muted-foreground">{pn.practice.toAdd}</p>
    </div>
    <p className="border-t pt-3 text-sm text-muted-foreground">{pn.practice.cards}</p>
  </Shell>;
  if (slug === 'track') return <Shell label={label}>
    <p className="text-sm text-muted-foreground">{pn.track.head}</p>
    <ul className="grid gap-3">{pn.track.rows.map(([title, company, stage, next]) => <li key={title} className={row}>
      <span className="font-semibold leading-snug">{title}</span>
      <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{company}</span>
      <span className="flex flex-wrap items-center gap-2"><Badge variant="outline">{stageLabel[stage][locale]}</Badge><span className="text-xs text-muted-foreground">{next}</span></span>
    </li>)}</ul>
    <p className="text-xs text-muted-foreground">{pn.track.note}</p>
  </Shell>;
  if (slug === 'alerts') return <Shell label={label}>
    <div className="grid gap-1 rounded-xl border bg-background/60 p-3">
      <span className="flex items-center gap-2 font-semibold"><Bell className="size-4 text-muted-foreground" aria-hidden="true" />{pn.alerts.name}</span>
      <span className="text-sm text-muted-foreground">{pn.alerts.freq} · {pn.alerts.next}</span>
    </div>
    <ul className="grid gap-2">{pn.alerts.channels.map(([name, on]) => <li key={name} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"><span>{name}</span><Badge variant={on ? 'success' : 'outline'}>{on ? pn.alerts.on : pn.alerts.off}</Badge></li>)}</ul>
    <Button variant="outline" className="w-fit" disabled>{pn.alerts.preview}</Button>
  </Shell>;
  const run = p.runs[0];
  return <Shell label={label}>
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-background/60 p-3">
      <div className="grid min-w-0 gap-2">
        <span className="font-medium">{run.op}</span>
        <span className="text-sm text-muted-foreground">{run.job}</span>
        <span className="flex flex-wrap items-center gap-2"><StatusBadge status={run.status} locale={locale} /><Badge variant="outline">{run.origin}</Badge></span>
      </div>
      <FitScore score={run.score} locale={locale} />
    </div>
  </Shell>;
}

const stageIcon = { cv: FileUser, search: Search, evaluate: Sparkles, docs: FileText, track: ClipboardList } as const;

/** Hero card: one job's journey through the app's five stages. Illustrative: nothing here is read from an account.
 *  Plays once when it is on screen (ticks draw, steps rise in turn, the strip fills, the score settles). */
export function DemoCard() {
  const { locale } = useLocale();
  const d = landingCopy[locale].demo;
  const [ref, play] = useSeen<HTMLElement>(0.3);
  return <section ref={ref} data-play={play} aria-label={d.label} className="demo-card grid min-w-0 gap-5 rounded-2xl border bg-card p-5 shadow-md sm:p-6">
    <Badge variant="outline" className="w-fit">{d.label}</Badge>
    <div className="grid gap-1">
      <h2 className="text-2xl font-semibold leading-snug not-italic">{d.title}</h2>
      <p className="text-sm text-muted-foreground">{d.company}</p>
    </div>
    <div className="grid gap-2">
      <span className="text-sm font-medium tabular-nums text-primary">{d.progress}</span>
      <div aria-hidden="true" className="grid grid-cols-5 gap-1.5">
        {d.steps.map((step, index) => <span key={step.stage} style={{ '--i': index } as CSSProperties} className={cn('demo-seg h-2 rounded-full', step.state === 'done' && 'bg-primary', step.state === 'current' && 'bg-warning/70', step.state === 'next' && 'bg-muted')} />)}
      </div>
    </div>
    <ol aria-label={d.list} className="grid">
      {d.steps.map((step, index) => {
        const Icon = stageIcon[step.stage as keyof typeof stageIcon];
        const last = index === d.steps.length - 1;
        return <li key={step.stage} style={{ '--i': index } as CSSProperties} aria-current={step.state === 'current' ? 'step' : undefined} className="demo-step relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3">
          {!last && <span aria-hidden="true" className={cn('absolute left-[1.0625rem] top-9 h-[calc(100%-1.75rem)] w-0.5 rounded-full', step.state === 'done' ? 'bg-primary/35' : 'bg-border')} />}
          <span aria-hidden="true" className={cn('grid size-9 place-items-center rounded-full',
            step.state === 'done' && 'bg-primary text-primary-foreground',
            step.state === 'current' && 'bg-warning/15 text-warning ring-2 ring-warning ring-offset-2 ring-offset-card',
            step.state === 'next' && 'bg-muted text-muted-foreground')}>
            {step.state === 'done' ? <Tick draw /> : <Icon className="size-4" />}
          </span>
          <div className={cn('grid min-w-0 gap-0.5 pb-5', last && 'pb-0')}>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium leading-snug">
              <span>{step.title}</span>{' '}
              {(step.stage === 'evaluate' || step.stage === 'docs') && <Badge variant="secondary" className="gap-1"><Sparkles className="size-3" aria-hidden="true" />{d.ai}</Badge>}
              {step.stage === 'evaluate' && <Badge variant="success" className="demo-score tabular-nums">{d.score}</Badge>}
            </p>
            <p className={cn('text-sm leading-relaxed [overflow-wrap:anywhere]', step.state === 'current' ? 'flex items-center gap-1.5 font-medium text-warning' : 'text-muted-foreground')}>
              {step.state === 'current' && <Clock className="size-4 shrink-0" aria-hidden="true" />}{step.note}
            </p>
          </div>
        </li>;
      })}
    </ol>
  </section>;
}
