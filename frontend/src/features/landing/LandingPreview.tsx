import type { ReactNode } from 'react';
import { AlertTriangle, Bot, Download, FileText, Globe, KeyRound, Laptop, Plug, Search } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { FitScore } from '../../components/FitScore';
import { SkillCoverage } from '../../components/SkillCoverage';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { cn } from '@/lib/utils';
import { landingCopy, previewCopy } from './copy';

const coverage = {
  required: ['React', 'TypeScript', 'Tailwind', 'Git', 'REST', 'Vite', 'Jest', 'Playwright', 'Docker', 'CI/CD', 'GraphQL', 'Next.js', 'AWS', 'Figma'],
  matched: ['React', 'TypeScript', 'Tailwind', 'Git', 'REST', 'Vite'],
  missing: ['Jest', 'Playwright', 'Docker', 'CI/CD', 'GraphQL', 'Next.js', 'AWS', 'Figma'],
  ratio: 6 / 14,
  method: 'keyword',
};

const glass = 'landing-glass absolute w-44 rounded-2xl p-3 xl:w-52';

/** Decorative product cards around the hero headline; desktop only. */
export function HeroCards() {
  const { locale } = useLocale();
  const c = landingCopy[locale].cards;
  const p = previewCopy[locale];
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
    <div className={cn(glass, 'left-0 top-16 flex items-center gap-3')}>
      <FitScore score={4.2} locale={locale} />
      <div className="min-w-0 text-left"><p className="text-xs text-muted-foreground">{c.fit}</p><p className="text-lg font-semibold tabular-nums">4.2/5</p></div>
    </div>
    <div className={cn(glass, 'bottom-24 left-6 grid gap-2 text-left')}>
      <div className="flex items-baseline justify-between gap-2"><span className="text-xs text-muted-foreground">{c.skills}</span><span className="text-lg font-semibold tabular-nums">6/14</span></div>
      <Progress value={43} />
    </div>
    <div className={cn(glass, 'right-0 top-20 grid w-52 gap-2 text-left xl:w-60')}>
      <p className="text-xs text-muted-foreground">{c.tasks}</p>
      {p.runs.filter(r => r.status !== 'running').map(r => <div key={r.op + r.status} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-xs font-medium">{r.op}</span><StatusBadge status={r.status} locale={locale} /></div>)}
    </div>
    <div className={cn(glass, 'bottom-20 right-8 grid gap-2 text-left')}>
      <span className="truncate text-xs font-medium">{p.jobs[1].title}</span>
      <Badge variant="warning" className="w-fit gap-1"><AlertTriangle className="size-3" aria-hidden="true" />{c.stale}</Badge>
    </div>
  </div>;
}

function Shell({ label, children }: { label: string; children: ReactNode }) {
  return <div className="landing-panel">
    <div className="grid min-w-0 gap-4 rounded-2xl border bg-card p-4 shadow-lg sm:p-6">
      <div className="flex items-center justify-between gap-3"><span className="min-w-0 text-sm font-semibold">{label}</span><Badge variant="outline" className="shrink-0">ตัวอย่าง / Sample</Badge></div>
      {children}
    </div>
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
  if (index === 0) return <Shell label={label}>
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-dashed bg-background/60 p-3">
      <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><FileText aria-hidden="true" size={20} /></span>
      <div className="min-w-0"><p className="truncate font-medium">my-cv.pdf</p><p className="text-sm text-muted-foreground">{pn.cvMeta}</p></div>
      <Badge variant="success">{pn.ready}</Badge>
    </div>
    <div className="grid gap-2"><p className="text-sm text-muted-foreground">{pn.parsed}</p>
      <ul className="flex flex-wrap gap-1.5">{pn.skills.map(s => <li key={s}><Badge variant="secondary">{s}</Badge></li>)}</ul></div>
  </Shell>;
  if (index === 1) return <Shell label={label}>
    <div className="flex min-h-10 items-center gap-2 rounded-md border border-input bg-background/60 px-3 text-base"><Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="sr-only">{pn.searchLabel}: </span><span className="truncate">{pn.searchValue}</span></div>
    <ul className="grid gap-3">{p.jobs.map((j, i) => <li key={j.title} className={cn(row, i === 0 && 'border-primary bg-accent')}>
      <span className="font-semibold leading-snug">{j.title}</span>
      <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{j.company} · {j.place}</span>
      <span className="flex flex-wrap gap-2"><Badge variant="outline">{j.age}</Badge>{j.stale && <Badge variant="warning" className="gap-1"><AlertTriangle className="size-3" aria-hidden="true" />{p.staleLabel}</Badge>}</span>
    </li>)}</ul>
  </Shell>;
  if (index === 2) return <Shell label={label}>
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
      <FitScore score={4.2} size="lg" locale={locale} />
      <ul className="grid gap-1.5 pl-4 text-sm text-muted-foreground [overflow-wrap:anywhere]">{p.reasons.map(r => <li className="list-disc" key={r}>{r}</li>)}</ul>
    </div>
    <SkillCoverage coverage={coverage} locale={locale} className="border-t pt-4" />
  </Shell>;
  if (index === 3) return <Shell label={label}>
    <div className="grid gap-3 rounded-xl border bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{pn.letterTitle}</span><Badge variant="secondary">{pn.letterRev}</Badge></div>
      <p className="text-sm">{pn.letterGreeting}</p>
      {['w-full', 'w-11/12', 'w-full', 'w-3/5'].map((w, i) => <span key={i} className={cn('h-2 rounded-full bg-muted', w)} />)}
    </div>
    <Button variant="outline" className="w-fit" disabled><Download aria-hidden="true" size={16} />{p.download}</Button>
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
    <div className="grid gap-2"><p className="text-sm text-muted-foreground">{pn.doors}</p>
      <ul className="flex flex-wrap gap-2">{[[Globe, 'REST'], [Plug, 'MCP'], [Bot, 'A2A']].map(([Icon, name]) => { const I = Icon as typeof Globe; return <li key={name as string}><Badge variant="secondary" className="gap-1.5 px-2.5 py-1 text-sm"><I className="size-4" aria-hidden="true" />{name as string}</Badge></li>; })}</ul></div>
  </Shell>;
}

/** Mini UI inside the "runs on your machine" card. */
export function LocalMini() {
  const { locale } = useLocale();
  const l = landingCopy[locale].local;
  const icons = [Laptop, KeyRound, FileText];
  return <div className="grid gap-2 rounded-xl border bg-background/60 p-3" aria-hidden="true">
    {l.rows.map((t, i) => { const I = icons[i]; return <div key={t} className="flex min-w-0 items-center gap-2 text-sm"><I className="size-4 shrink-0 text-primary" /><span className="min-w-0 [overflow-wrap:anywhere]">{t}</span></div>; })}
    <div className="flex flex-wrap items-center gap-2 border-t pt-2"><Button size="sm" variant="outline" disabled tabIndex={-1}>{l.submit}</Button><span className="text-xs text-muted-foreground">{l.submitNote}</span></div>
  </div>;
}

/** Mini UI inside the "connects to outside agents" card. */
export function AgentMini() {
  const { locale } = useLocale();
  const a = landingCopy[locale].agent;
  return <div className="grid gap-3 rounded-xl border bg-background/60 p-3" aria-hidden="true">
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <div className="min-w-0"><p className="font-mono text-sm font-medium">{a.token}</p><p className="text-xs text-muted-foreground">{a.scopes}</p></div>
      <Button size="sm" variant="ghost" disabled tabIndex={-1}>{a.revoke}</Button>
    </div>
    <div className="grid gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status="waiting_approval" locale={locale} /><span className="min-w-0 text-sm [overflow-wrap:anywhere]">{a.request}</span></div>
      <div className="flex gap-2"><Button size="sm" disabled tabIndex={-1}>{a.approve}</Button><Button size="sm" variant="outline" disabled tabIndex={-1}>{a.reject}</Button></div>
    </div>
  </div>;
}
