// AI feedback on one written answer (CR-IVP-01 FR-IVP-12/13) and the end-of-set summary (FR-IVP-14).
import { useId, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, CircleDashed, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AiLabel } from '@/components/AiMark';
import { BusyNote } from '@/components/BusyNote';
import type { PracticeDimension, PracticeFeedback, PracticeReport } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import type { PracticeCopy } from './copy';

type AnswerFeedback = Extract<PracticeFeedback, { kind: 'answer' }>;
const DIMS: PracticeDimension[] = ['structure', 'relevance', 'evidence', 'clarity', 'company_fit'];
const PARTS = ['S', 'T', 'A', 'R'] as const;
// Each STAR part keeps its own tint and always carries its letter, so colour never carries the meaning alone.
const TINT: Record<(typeof PARTS)[number], string> = {
  S: 'bg-accent/70 decoration-primary/60', T: 'bg-secondary decoration-muted-foreground/60',
  A: 'bg-primary/15 decoration-primary', R: 'bg-success/15 decoration-success',
};

export function FeedbackPanel({ c, feedback, answer, previous, onAsk, onRetry, onUseFact }: {
  c: PracticeCopy; feedback: PracticeFeedback | null; answer: string; previous?: AnswerFeedback; onAsk: () => void; onRetry: () => void;
  onUseFact: (text: string) => void;
}) {
  const id = useId();
  if (!feedback) return <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={onAsk}>{c.getFeedback}</Button>;
  if (feedback.status === 'pending') return <BusyNote label={c.grading} />;
  if (feedback.status !== 'done' || feedback.kind !== 'answer') return <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
    <TriangleAlert className="size-4" aria-hidden="true" />{c.gradeFailed}
    <Button type="button" size="sm" variant="outline" onClick={onRetry}><RotateCcw className="size-4" aria-hidden="true" />{c.askAgain}</Button></p>;
  const found = new Set(feedback.star.map(span => span.part));
  return <section aria-labelledby={id} className="grid gap-5 rounded-xl border border-primary/25 bg-background/60 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 id={id} className="text-base font-semibold">{c.feedbackTitle}</h3><AiLabel /></div>
    {feedback.summary && <p className="max-w-[70ch] leading-relaxed">{feedback.summary}</p>}
    <ul className="grid gap-3 sm:grid-cols-2">{DIMS.map(dim => {
      const score = feedback.scores[dim];
      const before = previous?.scores[dim];
      return <li key={dim} className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">{c.dims[dim]}</span>
          <span className="flex items-center gap-1.5 text-sm tabular-nums">
            {before !== undefined && before !== score && <span className={cn('inline-flex items-center gap-0.5 text-xs', score > before ? 'text-success' : 'text-warning')}>
              {score > before ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />}{score > before ? c.upFrom(before) : c.downFrom(before)}</span>}
            <span className="font-semibold">{c.outOf(score)}</span>
          </span>
        </div>
        <span className="grid grid-cols-5 gap-1" aria-hidden="true">{[1, 2, 3, 4, 5].map(n => <span key={n} className={cn('h-1.5 rounded-full', n <= score ? 'bg-primary' : 'bg-secondary')} />)}</span>
        <span className="text-xs text-muted-foreground">{c.anchors[dim]}</span>
      </li>;
    })}</ul>
    <div className="grid gap-2">
      <p className="text-sm font-medium">{c.yourAnswer}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={c.yourAnswer}>{PARTS.map(part => <li key={part} className={cn('flex items-center gap-1.5', !found.has(part) && 'text-muted-foreground')}>
        {found.has(part) ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <CircleDashed className="size-3.5" aria-hidden="true" />}
        <span>{c.starParts[part]}</span>{!found.has(part) && <span>· {c.starMissing}</span>}
      </li>)}</ul>
      <p className="max-w-[70ch] whitespace-pre-wrap break-words rounded-lg border bg-card p-3 leading-loose">{marked(answer, feedback.star, c)}</p>
    </div>
    {feedback.add.length > 0 && <div className="grid gap-1.5"><p className="text-sm font-medium">{c.toAdd}</p>
      <ul className="grid gap-1.5 text-sm leading-relaxed">{feedback.add.map(item => <li key={item} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span className="min-w-0 break-words">{item}</span></li>)}</ul></div>}
    {feedback.unused_facts.length > 0 && <div className="grid gap-1.5"><p className="text-sm font-medium">{c.unused}</p><p className="text-xs text-muted-foreground">{c.unusedHint}</p>
      <div className="flex flex-wrap gap-2">{feedback.unused_facts.map(fact => <button key={fact.id} type="button" onClick={() => onUseFact(fact.text)}
        className="max-w-full break-words rounded-lg border border-dashed border-primary/50 bg-accent/40 px-3 py-1.5 text-start text-sm text-accent-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{fact.text}</button>)}</div></div>}
  </section>;
}

function marked(answer: string, spans: AnswerFeedback['star'], c: PracticeCopy): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.start < at || span.end > answer.length) continue;  // overlapping or stale spans are skipped
    if (span.start > at) out.push(answer.slice(at, span.start));
    out.push(<mark key={span.start} data-part={span.part} title={c.starParts[span.part]}
      className={cn('rounded px-0.5 text-foreground underline decoration-2 underline-offset-4 [box-decoration-break:clone]', TINT[span.part])}>
      <span className="me-1 align-super text-[0.65em] font-semibold" aria-hidden="true">{span.part}</span>{answer.slice(span.start, span.end)}</mark>);
    at = span.end;
  }
  out.push(answer.slice(at));
  return out;
}

export function SummaryRound({ c, report, sections, onWrite }: { c: PracticeCopy; report: PracticeReport | null; sections: string[]; onWrite: () => void }) {
  const id = useId();
  const done = report?.status === 'done' ? report : null;
  const list = (title: string, items: string[], ordered = false) => items.length > 0 && <div className="grid content-start gap-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    {ordered ? <ol className="grid gap-2">{items.map((item, i) => <li key={item} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2 leading-relaxed">
      <span className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold tabular-nums text-accent-foreground" aria-hidden="true">{i + 1}</span><span className="min-w-0 break-words">{item}</span></li>)}</ol>
      : <ul className="grid gap-1.5 text-sm leading-relaxed">{items.map(item => <li key={item} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span className="min-w-0 break-words">{item}</span></li>)}</ul>}
  </div>;
  const tone = { ready: 'text-success', almost: 'text-warning', not_yet: 'text-muted-foreground' } as const;
  return <section aria-labelledby={id} className="grid gap-5 rounded-xl border bg-card p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid max-w-2xl gap-1"><h2 id={id} className="text-xl font-semibold">{c.summaryRound}</h2><p className="text-sm text-muted-foreground">{c.summaryHint}</p></div>
      {done && <AiLabel />}
    </div>
    {report?.status === 'pending' ? <BusyNote bar label={c.writing} />
      : done ? <>
        <div className="grid gap-6 md:grid-cols-2">{list(c.strengths, done.strengths)}{list(c.skills, done.skills_to_build)}</div>
        {list(c.plan, done.plan, true)}
        {done.readiness.length > 0 && <div className="grid gap-2"><h3 className="text-sm font-semibold">{c.readiness}</h3>
          <ul className="grid divide-y rounded-lg border">{done.readiness.filter(r => sections.includes(r.section)).map(r => <li key={r.section} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,14rem)_8rem_minmax(0,1fr)] sm:items-baseline sm:gap-4">
            <span className="text-sm font-medium">{c.sections[r.section]}</span>
            <span className={cn('text-sm font-semibold', tone[r.level])}>{c.levelsReady[r.level]}</span>
            <span className="text-sm text-muted-foreground">{r.note}</span>
          </li>)}</ul></div>}
        <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={onWrite}><RotateCcw className="size-4" aria-hidden="true" />{c.rewrite}</Button>
      </> : <>
        {report?.status === 'failed' && <p role="alert" className="text-sm text-destructive">{c.summaryFailed}</p>}
        <Button type="button" className="min-h-11 justify-self-start" onClick={onWrite}>{c.writeSummary}</Button>
      </>}
  </section>;
}
