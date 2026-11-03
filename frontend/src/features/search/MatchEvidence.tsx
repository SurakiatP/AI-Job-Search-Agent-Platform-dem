import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AiSpinner } from '@/components/AiMark';
import { NewSessionButton } from '../sessions/NewSessionDialog';
import { safeHttpUrl } from '../projects/useResource';
import type { AiMatch, Copy, JobSearchItem, Match } from './SearchPage';

export function MatchBadge({ match, c }: { match: Match | null | undefined; c: Copy }) {
  if (!match) return <Badge variant="secondary">{c.noSkills}</Badge>;
  return <Badge variant="outline">{c.ats(match.score_percent)} · {match.matched.length}/{match.required_count}</Badge>;
}

const bandVariant = { 5: 'success', 4: 'success', 3: 'warning', 2: 'secondary', 1: 'outline' } as const;

// Real AI fit band on the 1–5 scale; never a percent.
export function BandBadge({ ai, c, aiLabel }: { ai: AiMatch; c: Copy; aiLabel?: string }) {
  return <Badge variant={bandVariant[ai.band]}>{aiLabel ? `${aiLabel} · ` : ''}{ai.band} / 5 · {c.bands[ai.band]}</Badge>;
}

export function Chips({ title, items, variant, c }: { title: string; items: string[]; variant: 'success' | 'outline' | 'destructive'; c: Copy }) {
  return <div className="grid gap-2"><h4 className="text-sm font-semibold">{title}</h4>
    <div className="flex flex-wrap gap-2">{items.length ? items.map(s => <Badge key={s} variant={variant === 'destructive' ? 'outline' : variant} className={`break-words ${variant === 'destructive' ? 'border-destructive text-destructive' : ''}`}>{s}</Badge>) : <span className="text-sm text-muted-foreground">{c.noneMatched}</span>}</div></div>;
}

export type T = (key: string, options?: Record<string, string | number>) => string;

export function MatchSummary({ job, c, tSearch, ranking, projectId, cv }: { job: JobSearchItem; c: Copy; tSearch: T; ranking: boolean; projectId: string; cv?: { name: string } }) {
  const { match, ai_match: ai } = job;
  const meterTone = ai ? (ai.band >= 4 ? 'bg-success' : ai.band === 3 ? 'bg-warning' : 'bg-muted-foreground') : '';
  return <section aria-labelledby={`evidence-${job.slug}`} className={`grid gap-4 rounded-lg ${ai ? 'bg-ai-soft' : 'bg-muted'} p-4`}>
    <h3 id={`evidence-${job.slug}`} className="text-sm font-semibold">{tSearch('controls.matchEvidence')}</h3>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid content-start gap-2">
        <p className="text-xs text-muted-foreground">{tSearch('controls.aiEstimate')}</p>
        {ai ? <>
          <div aria-hidden="true" className="flex gap-1">{[1, 2, 3, 4, 5].map(i => <span key={i} className={`h-2 flex-1 rounded-sm ${i <= ai.band ? meterTone : 'bg-ai-border'}`} />)}</div>
          <div className="flex flex-wrap gap-2"><BandBadge ai={ai} c={c} /></div>
          <p className="text-xs leading-relaxed text-muted-foreground">{tSearch('methods.aiNote')}</p>
          {ai.uncertain && <p className="text-xs text-muted-foreground">{tSearch('controls.aiUncertain')}</p>}
        </> : !ranking && <p className="text-sm text-muted-foreground">{tSearch('controls.aiUnavailable')}</p>}
      </div>
      <div className="grid content-start gap-2">
        <p className="text-xs text-muted-foreground">{tSearch('controls.keywordCoverage')}</p>
        {match ? <p className="text-sm tabular-nums">{tSearch('controls.skillsFound', { found: match.matched.length, total: match.required_count })}</p> : <MatchBadge match={match} c={c} />}
      </div>
    </div>
    {ai ? <>
      <p className="text-sm"><span className="text-muted-foreground">{c.seniorityLabel}: </span>{c.seniority[ai.seniority] ?? ai.seniority}</p>
      <EvidenceList ai={ai} c={c} />
      <MissingMust job={job} ai={ai} c={c} projectId={projectId} cv={cv} />
      <Chips title={c.niceMissing} items={ai.nice_missing} variant="outline" c={c} />
    </> : match && <>
      <Chips title={c.matchedSkills} items={match.matched} variant="success" c={c} />
      <Chips title={c.missingSkills} items={match.missing} variant="outline" c={c} />
    </>}
    {!ai && <p className="text-xs text-muted-foreground">{c.matchNote}</p>}
  </section>;
}

// Each skill the AI found in the CV, with the CV line that quotes it (plain text; two lines, full text on hover).
export function EvidenceList({ ai, c }: { ai: AiMatch; c: Copy }) {
  const quoted = ai.skills_evidenced.filter(s => ai.evidence?.[s]);
  const bare = ai.skills_evidenced.filter(s => !ai.evidence?.[s]);
  return <div className="grid gap-2"><h4 className="text-sm font-semibold">{c.evidenced}</h4>
    {ai.skills_evidenced.length === 0 && <span className="text-sm text-muted-foreground">{c.noneMatched}</span>}
    {quoted.length > 0 && <ul className="grid gap-2">{quoted.map(skill => <li key={skill} className="grid min-w-0 gap-1">
      <Badge variant="success" className="w-fit max-w-full break-words">{skill}</Badge>
      <blockquote title={ai.evidence![skill]} aria-label={`${c.quoteFrom}: ${skill}`} className="line-clamp-2 break-words rounded-md bg-card px-2 py-1 text-xs leading-relaxed text-muted-foreground">{ai.evidence![skill]}</blockquote>
    </li>)}</ul>}
    {bare.length > 0 && <div className="flex flex-wrap gap-2">{bare.map(s => <Badge key={s} variant="success" className="break-words">{s}</Badge>)}</div>}
  </div>;
}

// Must-have gaps, each with a way to act: tailoring needs an evaluation first, so the link opens the new-evaluation dialog for this job.
export function MissingMust({ job, ai, c, projectId, cv }: { job: JobSearchItem; ai: AiMatch; c: Copy; projectId: string; cv?: { name: string } }) {
  const source = safeHttpUrl(job.source_url);
  return <div className="grid gap-2"><h4 className="text-sm font-semibold">{c.mustMissing}</h4>
    {ai.must_missing.length === 0 ? <span className="text-sm text-muted-foreground">{c.noneMatched}</span> : <ul className="flex flex-wrap gap-x-3 gap-y-1 ps-3">{ai.must_missing.map(skill => <li key={skill} className="flex min-w-0 flex-wrap items-center gap-1">
      <Badge variant="outline" className="break-words border-destructive text-destructive">{skill}</Badge>
      <NewSessionButton projectId={projectId} cvName={cv?.name} variant="link" size="sm" aria-label={c.tailorCvFor(skill)} className="h-auto whitespace-normal px-1 text-left text-xs"
        job={{ inline: { title: job.title, company: job.company, description: job.description_markdown.slice(0, 50000), source_url: source } }}>{c.tailorCv}</NewSessionButton>
    </li>)}</ul>}
  </div>;
}

// What the agent is doing now, derived from page state: profiling (reading) -> empty pool (shortlisting) -> scored i of N.
export function AgentSteps({ c, step, scored, total }: { c: Copy; step: 0 | 1 | 2; scored: number; total: number }) {
  const labels = [c.steps.read, c.steps.shortlist, c.steps.score(scored, total)];
  return <div role="status" aria-live="polite" className="grid gap-2 rounded-lg border border-ai-border bg-card p-4 text-sm">
    <p className="flex items-center gap-2 font-medium"><AiSpinner size="sm" />{c.agentWorking}</p>
    <ol className="grid gap-2">{labels.map((label, i) => <li key={i} aria-current={i === step ? 'step' : undefined}
      className={`flex items-center gap-2 ${i < step ? 'text-muted-foreground' : i === step ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
      <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full text-xs tabular-nums ${i < step ? 'bg-ai text-ai-contrast' : i === step ? 'border-[1.5px] border-foreground font-medium text-foreground' : 'border border-[color:var(--border-strong)]'}`}>{i < step ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}</span>
      <span>{label}</span>
    </li>)}</ol>
  </div>;
}

