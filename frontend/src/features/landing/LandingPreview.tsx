import type { ReactNode } from 'react';
import { AlertTriangle, Bell, Check, Clock, Download, FileText, Search } from 'lucide-react';
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
      <span className="flex flex-wrap gap-2"><Badge variant="outline">{j.age}</Badge>{j.stale && <Badge variant="warning" className="gap-1"><AlertTriangle className="size-3" aria-hidden="true" />{p.staleLabel}</Badge>}</span>
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

/** Hero card in plain words. Illustrative: nothing here is read from an account. */
export function DemoCard() {
  const { locale } = useLocale();
  const d = landingCopy[locale].demo;
  return <section aria-label={d.label} className="grid min-w-0 gap-4 rounded-xl border bg-card p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Badge variant="outline">{d.label}</Badge>
    </div>
    <div className="grid gap-1 border-b pb-4">
      <h2 className="text-lg font-semibold leading-snug not-italic">{d.title}</h2>
      <p className="text-sm text-muted-foreground">{d.job}</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid content-start gap-1 rounded-lg border bg-background/60 p-3">
        <span className="text-sm text-muted-foreground">{d.fit}</span>
        <FitScore score={4.2} size="lg" locale={locale} />
        <span className="text-sm text-muted-foreground">{d.fitNote}</span>
      </div>
      <div className="grid content-start gap-1 rounded-lg border bg-background/60 p-3">
        <span className="text-sm text-muted-foreground">{d.skills}</span>
        <span className="text-3xl font-semibold tabular-nums">{d.skillsValue}</span>
        <span className="text-sm text-muted-foreground">{d.skillsNote}</span>
      </div>
    </div>
    <p className="flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm font-medium text-warning"><Clock className="size-4 shrink-0" aria-hidden="true" />{d.waiting}</p>
  </section>;
}
