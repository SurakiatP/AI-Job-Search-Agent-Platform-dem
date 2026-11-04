// One practice set laid out as the interview day (CR-IVP-01): a run sheet of rounds with a course line that fills as
// questions become ready, and a work pane for the current question (or the flashcard stage in the technical round).
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Pencil, RotateCcw, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Breadcrumb } from '@/components/PageBack';
import { AiLabel, GemSparkle } from '@/components/AiMark';
import { BusyNote } from '@/components/BusyNote';
import { apiRequest } from '@/lib/api';
import type { ExperienceView, Locale, PracticeAttempt, PracticeFeedback, PracticeQuestion, PracticeSection, PracticeSetDetail, SessionView } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import { ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { sendJson, useResource } from '../projects/useResource';
import { Flashcards } from './Flashcards';
import { FeedbackPanel, SummaryRound } from './Feedback';
import { RenameDialog } from './PracticeTab';
import { MINUTES, SECTION_ORDER, practiceCopy, type PracticeCopy } from './copy';

type Round = { id: PracticeSection | 'reverse' | 'summary'; questions: PracticeQuestion[] };
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const TIMER_SECONDS = 120, URGENT_SECONDS = 15;
const done = (q: PracticeQuestion) => (q.section === 'technical' ? q.card_rating === 'know' : q.ready);

export function PracticeSetPage() {
  const { projectId = '', sessionId = '', setId = '' } = useParams();
  const { i18n } = useTranslation();
  const locale: Locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = practiceCopy[locale];
  const path = `/projects/${projectId}/practice-sets/${setId}`;
  const detail = useResource<PracticeSetDetail>(path);
  const session = useResource<SessionView>(`/projects/${projectId}/sessions/${sessionId}`);
  const project = useResource<{ name: string }>(`/projects/${projectId}`);
  const { t } = useTranslation();
  const bank = useResource<ExperienceView>(`/projects/${projectId}/experience`);
  const [overrides, setOverrides] = useState<Record<string, Partial<PracticeQuestion>>>({});
  const [round, setRound] = useState<Round['id'] | null>(null);
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const direction = useRef<1 | -1>(1);
  const [renaming, setRenaming] = useState(false);
  const [failure, setFailure] = useState('');
  const reload = detail.reload;
  // Poll while anything AI is still working: the questions, a feedback, or the summary.
  const waiting = detail.data?.status === 'generating' || detail.data?.report?.status === 'pending'
    || (detail.data?.questions ?? []).some(q => q.attempts.some(a => a.feedback?.status === 'pending'));
  useEffect(() => { if (!waiting) return; const timer = window.setInterval(reload, 3000); return () => window.clearInterval(timer); }, [waiting, reload]);

  const questions = useMemo(() => (detail.data?.questions ?? []).map(q => ({ ...q, ...overrides[q.id] })), [detail.data, overrides]);
  const rounds = useMemo<Round[]>(() => {
    const list: Round[] = SECTION_ORDER.map(id => ({ id, questions: questions.filter(q => q.section === id) })).filter(r => r.questions.length);
    if (detail.data?.reverse_questions.length) list.push({ id: 'reverse', questions: [] });
    if (list.length) list.push({ id: 'summary', questions: [] });
    return list;
  }, [questions, detail.data]);
  const current = rounds.find(r => r.id === round) ?? rounds[0];
  const update = useCallback((id: string, patch: Partial<PracticeQuestion>, body: object) => {
    setOverrides(all => ({ ...all, [id]: { ...all[id], ...patch } }));
    void sendJson(`/projects/${projectId}/practice-questions/${id}`, 'PATCH', body).catch(() => {
      // Not saved: drop the optimistic value so the screen shows what the server has.
      setOverrides(all => { const { [id]: _dropped, ...rest } = all; return rest; });
      setFailure(c.failedAction); reload();
    });
  }, [projectId, c.failedAction, reload]);
  const call = useCallback(async (fn: () => Promise<unknown>) => { setFailure(''); try { await fn(); reload(); } catch { setFailure(c.failedAction); } }, [reload, c.failedAction]);
  const askFeedback = useCallback((attemptId: string) => call(() => apiRequest(`/async/projects/${projectId}/practice-attempts/${attemptId}/feedback`, { method: 'POST' })), [call, projectId]);
  const checkCard = useCallback((id: string, answer: string) => call(async () => {
    const attempt = await sendJson<PracticeAttempt>(`/projects/${projectId}/practice-questions/${id}/attempts`, 'POST', { answer });
    await apiRequest(`/async/projects/${projectId}/practice-attempts/${attempt.id}/feedback`, { method: 'POST' });
  }), [call, projectId]);

  if (detail.status === 'loading' && !detail.data) return <LoadingState />;
  if (detail.errorStatus === 404) return <MissingResource />;
  // A failed poll keeps the page (and the card the user is on); only a first load failure replaces it.
  if (!detail.data) return <ErrorState onRetry={reload} />;
  const set = detail.data;
  const base = `/app/projects/${projectId}`;
  const sessionHref = `${base}/sessions/${sessionId}?tab=practice`;
  const total = questions.length;
  const readyCount = questions.filter(done).length;
  const s = session.data;
  const select = (id: Round['id'], at = 0) => { const to = rounds.findIndex(x => x.id === id); direction.current = to < position || (to === position && at < index) ? -1 : 1; setRound(id); setIndex(at); };
  const position = current ? rounds.indexOf(current) : -1;
  const goNext = () => { direction.current = 1; if (current && index + 1 < current.questions.length) setIndex(index + 1); else if (rounds[position + 1]) select(rounds[position + 1].id); };
  const goPrev = () => { direction.current = -1; if (index > 0) setIndex(index - 1); else if (rounds[position - 1]) { const prev = rounds[position - 1]; select(prev.id, Math.max(0, prev.questions.length - 1)); } };

  return <section className="grid min-w-0 gap-6 lg:gap-8">
    <div className="grid gap-1">
    <Breadcrumb label={c.title} items={[{ label: project.data?.name ?? '…', to: `${base}/overview` }, { label: t('nav.evaluate'), to: `${base}/sessions` },
      { label: s?.job_title ?? s?.title ?? c.back, to: sessionHref }, { label: set.name }]} />
    <header className="flex flex-wrap items-end justify-between gap-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold [overflow-wrap:anywhere] sm:text-3xl">{set.name}</h1>
        <p className="mt-1 break-words text-sm text-muted-foreground">{[c.levels[set.level], s?.job_title && `${s.job_title}${s.job_company ? ` · ${s.job_company}` : ''}`, s?.cv_name && `CV: ${s.cv_name}${s.cv_revision != null ? ` · v${s.cv_revision}` : ''}`].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {set.status === 'ready' && total > 0 && <ProgressRing ready={readyCount} total={total} label={c.readyOf(readyCount, total)} />}
        <Button type="button" variant="outline" onClick={() => setRenaming(true)}><Pencil className="size-4" aria-hidden="true" />{c.rename}</Button>
      </div>
    </header>
    </div>
    {(failure || detail.status === 'error') && <Alert severity="error">{failure || c.failedAction}</Alert>}

    {set.status !== 'ready' ? <div className="grid justify-items-start gap-3 rounded-3xl border bg-card p-6 shadow-[var(--shadow-soft)]">
      {set.status === 'generating' ? <><BusyNote bar label={c.generating} /><p className="text-sm text-muted-foreground">{c.generatingBody}</p></>
        : <><p className="font-medium text-destructive">{c.failed}</p><Button type="button" variant="outline" onClick={() => void apiRequest(`${path}/retry`, { method: 'POST' }).then(reload).catch(() => setFailure(c.failedAction))}><RotateCcw className="size-4" aria-hidden="true" />{c.retry}</Button></>}
    </div> : <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[21rem_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-3 lg:sticky lg:top-4">
        <RoundPills c={c} rounds={rounds} current={current?.id} onSelect={select} />
        <RunSheet c={c} rounds={rounds} current={current?.id} index={index} reverseCount={set.reverse_questions.length}
          className="hidden lg:grid" onSelect={select} readyCount={readyCount} total={total} />
      </div>
      <div className="min-w-0">
        {current?.id === 'summary' ? <SummaryRound c={c} report={set.report} sections={set.sections.map(x => x.id)}
            onWrite={() => void call(() => apiRequest(`/async/projects/${projectId}/practice-sets/${setId}/report`, { method: 'POST' }))} />
          : current?.id === 'reverse' ? <ReverseRound c={c} items={set.reverse_questions} />
          : current?.id === 'technical' ? <section aria-label={c.sections.technical} className="grid gap-4">
            <h2 className="text-lg font-semibold">{c.sections.technical}</h2>
            <Flashcards key={`${set.id}-technical`} cards={current.questions} c={c} onRate={(id, rating) => update(id, { card_rating: rating }, { card_rating: rating })} onCheck={checkCard} />
          </section>
          : current && current.questions[index] ? <WrittenQuestion key={current.questions[index].id} c={c} projectId={projectId} question={current.questions[index]}
            facts={bank.data?.items ?? []} roundLabel={c.sections[current.questions[index].section]} counter={`${index + 1}/${current.questions.length}`}
            onReady={ready => update(current.questions[index].id, { ready }, { ready })}
            answer={drafts[current.questions[index].id] ?? ''} onAnswer={text => setDrafts(all => ({ ...all, [current.questions[index].id]: text }))}
            dir={direction.current} onAttempt={reload} onAsk={askFeedback}
            onPrev={position > 0 || index > 0 ? goPrev : undefined} onNext={position < rounds.length - 1 || index + 1 < current.questions.length ? goNext : undefined} /> : null}
      </div>
    </div>}
    {renaming && <RenameDialog c={c} set={set} path={path} onClose={() => setRenaming(false)} onDone={() => { setRenaming(false); reload(); }} />}
  </section>;
}

function ProgressRing({ ready, total, label }: { ready: number; total: number; label: string }) {
  const radius = 20, circ = 2 * Math.PI * radius;
  return <div data-testid="practice-progress" data-ready={ready} data-total={total} aria-hidden="true" className="flex items-center gap-3 rounded-full bg-secondary py-1 pe-4 ps-1">
    <svg viewBox="0 0 48 48" className="size-12 -rotate-90">
      <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="5" className="stroke-border" />
      <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-(--dur-slow) ease-(--ease-out)"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - (total ? ready / total : 0))} />
    </svg>
    <span className="text-sm font-medium tabular-nums">{label}</span>
  </div>;
}

// Phone: the rounds as one scroll-snap row of pills above the question.
function RoundPills({ c, rounds, current, onSelect }: { c: PracticeCopy; rounds: Round[]; current?: Round['id']; onSelect: (id: Round['id']) => void }) {
  const row = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('[aria-current="step"]');
    if (el && row.current) row.current.scrollTo({ left: el.offsetLeft - (row.current.clientWidth - el.offsetWidth) / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [current]);
  return <nav aria-label={c.rounds} className="min-w-0 lg:hidden">
    <ul ref={row} className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">{rounds.map((round, n) => {
      const label = round.id === 'summary' ? c.summaryRound : round.id === 'reverse' ? c.reverse : c.sections[round.id];
      const complete = round.id !== 'summary' && round.id !== 'reverse' && round.questions.every(done);
      const active = round.id === current;
      return <li key={round.id} className="snap-center shrink-0">
        <button type="button" onClick={() => onSelect(round.id)} aria-current={active ? 'step' : undefined}
          className={cn('inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            active ? 'border-primary bg-primary-fill text-primary-fill-foreground' : 'bg-card text-foreground')}>
          <span aria-hidden="true" className="tabular-nums opacity-80">{complete ? <Check className="size-4" /> : n + 1}</span>{label}
        </button>
      </li>;
    })}</ul>
  </nav>;
}

function RunSheet({ c, rounds, current, index, readyCount, total, reverseCount, className, onSelect }: {
  c: PracticeCopy; rounds: Round[]; current?: Round['id']; index: number; readyCount: number; total: number; reverseCount: number;
  className?: string; onSelect: (id: Round['id'], at?: number) => void;
}) {
  return <nav aria-label={c.rounds} className={cn('gap-4 rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6', className)}>
    <div className="flex items-baseline justify-between gap-3"><h2 className="text-base font-semibold">{c.rounds}</h2><span className="text-sm tabular-nums text-muted-foreground">{c.readyOf(readyCount, total)}</span></div>
    <ol className="grid">{rounds.map((round, n) => {
      const extra = round.id === 'reverse' || round.id === 'summary';
      const count = round.id === 'reverse' ? reverseCount : round.questions.length;
      const finished = extra ? 0 : round.questions.filter(done).length;
      const complete = !extra && finished === count;
      const active = round.id === current;
      const label = round.id === 'summary' ? c.summaryRound : round.id === 'reverse' ? c.reverse : c.sections[round.id];
      const sub = round.id === 'summary' ? c.summarySub : round.id === 'reverse' ? c.questions(count) : round.id === 'technical' ? `${c.cards(count)} · ${c.knownOf(finished, count)}` : c.readyOf(finished, count);
      const minutes = round.id === 'summary' ? null : round.id === 'reverse' ? 3 : Math.max(1, Math.round(count * MINUTES[round.id]));
      return <li key={round.id} className="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
        {n < rounds.length - 1 && <span aria-hidden="true" className={cn('absolute bottom-0 left-[1.0625rem] top-9 w-0.5 rounded-full transition-colors duration-(--dur-slow)', complete ? 'bg-primary' : 'bg-border')} />}
        <span aria-hidden="true" className={cn('relative z-10 grid size-9 place-items-center rounded-full border-2 shadow-[var(--shadow-xs)] text-sm font-semibold tabular-nums transition-colors duration-(--dur-slow)',
          complete ? 'border-primary bg-primary-fill text-primary-fill-foreground' : active ? 'border-primary bg-card text-primary ring-4 ring-accent' : 'border-border bg-card text-muted-foreground')}>
          {complete ? <Check className="size-4" /> : n + 1}
        </span>
        <div className="min-w-0">
          <button type="button" onClick={() => onSelect(round.id)} aria-current={active ? 'step' : undefined}
            className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-md py-2 text-start transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="min-w-0"><span className={cn('block break-words text-sm font-semibold', active && 'text-primary')}>{label}</span><span className="block text-xs text-muted-foreground">{sub}</span>
              {!extra && <span aria-hidden="true" className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-border"><span className="block h-full origin-left rounded-full bg-primary transition-transform duration-(--dur-slow) ease-(--ease-out)" style={{ transform: `scaleX(${count ? finished / count : 0})` }} /></span>}</span>
            {minutes !== null && <span className="pt-0.5 text-xs tabular-nums text-muted-foreground">{c.minutes(minutes)}</span>}
          </button>
          {active && round.id !== 'technical' && !extra && <ul className="mt-1 grid gap-0.5">{round.questions.map((q, i) => <li key={q.id}>
            <button type="button" onClick={() => onSelect(round.id, i)} aria-current={i === index ? 'true' : undefined}
              className={cn('flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1 text-start text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', i === index ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              <span aria-hidden="true" className={cn('mt-2 size-2 shrink-0 rounded-full border-[1.5px]', q.ready ? 'border-success bg-success' : i === index ? 'border-primary bg-primary' : 'border-primary/60')} />
              <span className="line-clamp-2 min-w-0 break-words">{q.prompt}</span>
            </button>
          </li>)}</ul>}
        </div>
      </li>;
    })}</ol>
  </nav>;
}

function spokenLength(text: string, locale: 'th' | 'en') {
  // ponytail: rough speaking rate (~12 characters a second); good enough to tell 30 s from 3 min.
  const seconds = Math.round(text.trim().length / 12);
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return locale === 'th' ? (m ? `${m} นาที ${s} วินาที` : `${s} วินาที`) : (m ? `${m} min ${s} s` : `${s} s`);
}

function WrittenQuestion({ c, projectId, question, facts, roundLabel, counter, answer, onAnswer, dir, onReady, onAttempt, onAsk, onPrev, onNext }: {
  c: PracticeCopy; projectId: string; question: PracticeQuestion; facts: ExperienceView['items']; roundLabel: string; counter: string;
  answer: string; onAnswer: (text: string) => void; dir: 1 | -1;
  onReady: (ready: boolean) => void; onAttempt: () => void; onAsk: (attemptId: string) => void; onPrev?: () => void; onNext?: () => void;
}) {
  const id = useId();
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const setAnswer = (next: string | ((text: string) => string)) => onAnswer(typeof next === 'function' ? next(answer) : next);
  const box = useRef<HTMLTextAreaElement>(null);
  const card = useRef<HTMLElement>(null);
  useEffect(() => { if (!reducedMotion()) card.current?.animate([{ opacity: 0, transform: `translateX(${dir * 16}px)` }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }); }, [dir]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showExample, setShowExample] = useState(false);
  const [timer, setTimer] = useState<number | null>(null);
  useEffect(() => { if (timer === null || timer <= 0) return; const t = window.setTimeout(() => setTimer(timer - 1), 1000); return () => window.clearTimeout(t); }, [timer]);
  const stories = facts.filter(fact => question.evidence_ids.includes(fact.id));
  const logistics = question.section === 'logistics';
  const star = question.section === 'behavioral' || question.section === 'situational';
  const urgent = timer !== null && timer > 0 && timer <= URGENT_SECONDS;
  const insert = (label: string) => { setAnswer(text => `${text.trimEnd() ? `${text.trimEnd()}\n` : ''}${label}: `); box.current?.focus(); };
  async function save() {
    if (!answer.trim()) return;
    setSaving(true); setError('');
    try { await sendJson<PracticeAttempt>(`/projects/${projectId}/practice-questions/${question.id}/attempts`, 'POST', { answer: answer.trim() }); onAttempt(); }
    catch { setError(c.failedAction); } finally { setSaving(false); }
  }
  return <article ref={card} className="grid gap-4 rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6" aria-labelledby={`${id}-q`}>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2">
      <h2 id={`${id}-q`} className="max-w-[34em] text-balance text-xl font-semibold leading-snug sm:text-2xl">{question.prompt}</h2>
      <AiLabel className="mt-1" />
      <p className="col-span-2 text-sm text-muted-foreground">{c.why}: <span className="text-foreground">{question.why}</span></p>
    </div>
    {logistics ? <Points title={c.guidance} items={question.key_points} open /> : <>
      <div className="grid gap-2">
        <label htmlFor={`${id}-answer`} className="text-sm font-medium">{c.answer}</label>
        <Textarea ref={box} id={`${id}-answer`} value={answer} maxLength={4000} rows={7} placeholder={c.answerPlaceholder} onChange={event => setAnswer(event.target.value)} className="min-h-40 text-base leading-relaxed" />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">{answer.trim() ? c.spoken(spokenLength(answer, locale)) : ' '}</span>
          <Button type="button" variant="ghost" className="min-h-11" aria-pressed={timer !== null} data-urgent={urgent || undefined} onClick={() => setTimer(timer === null ? TIMER_SECONDS : null)}>
            <TimerRing left={timer} />
            {timer === null ? c.timer : <span className={cn('tabular-nums', (urgent || timer === 0) && 'font-semibold text-warning', urgent && 'motion-safe:animate-pulse')}>{`${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, '0')} · ${c.stopTimer}`}</span>}
          </Button>
        </div>
      </div>
      {star && <div className="grid gap-2"><p className="text-sm font-medium">{c.frame}</p>
        <div className="flex flex-wrap gap-2">{c.frameChips.map((label, i) => <button key={label} type="button" onClick={() => insert(label)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-secondary px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:active:scale-[0.97]">
          <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{'STAR'[i]}</span>{label}</button>)}</div>
      </div>}
      {stories.length > 0 && <div className="grid gap-2"><p className="text-sm font-medium">{c.stories}</p>
        <div className="flex flex-wrap gap-2">{stories.map(fact => <button key={fact.id} type="button" onClick={() => setAnswer(text => (text.trim() ? `${text.trim()}\n${fact.text}` : fact.text))}
          className="max-w-full break-words rounded-2xl border border-dashed border-primary/50 bg-accent/40 px-4 py-3 text-start text-sm text-accent-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{fact.text}</button>)}</div>
      </div>}
      {error && <Alert severity="error">{error}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button type="button" variant="ghost" disabled={!onPrev} onClick={onPrev} aria-label={c.prev}><ArrowLeft className="size-4" aria-hidden="true" /></Button>
          <span className="self-center px-1 text-sm tabular-nums text-muted-foreground"><span className="sr-only">{roundLabel} </span>{counter}</span>
          <Button type="button" variant="ghost" disabled={!onNext} onClick={onNext}>{c.next}<ArrowRight className="size-4" aria-hidden="true" /></Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={question.ready ? 'secondary' : 'outline'} aria-pressed={question.ready} onClick={() => onReady(!question.ready)}>
            {question.ready && <ReadyBurst />}{question.ready ? c.ready : c.markReady}</Button>
          <Button type="button" busy={saving} disabled={saving || !answer.trim()} onClick={() => void save()}>{c.saveAnswer}</Button>
        </div>
      </div>
      {question.attempts[0] && <FeedbackPanel c={c} feedback={question.attempts[0].feedback} answer={question.attempts[0].answer}
        previous={answerFeedback(question.attempts.slice(1).find(a => answerFeedback(a.feedback))?.feedback ?? null)}
        onAsk={() => onAsk(question.attempts[0].id)} onRetry={() => onAsk(question.attempts[0].id)}
        onUseFact={text => setAnswer(current => (current.trim() ? `${current.trim()}\n${text}` : text))} />}
      <div className="grid gap-3 border-t pt-4">
        <Points title={c.keyPoints} items={question.key_points} />
        {question.model_answer ? <div className="grid gap-2">
          <button type="button" aria-expanded={showExample} onClick={() => setShowExample(open => !open)} className="flex w-fit items-center gap-2 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {c.example}<ChevronDown className={cn('size-4 transition-transform', showExample && 'rotate-180')} aria-hidden="true" /></button>
          {showExample && <p className="max-w-[70ch] rounded-lg bg-secondary p-3 leading-relaxed">{question.model_answer}</p>}
        </div> : <p className="text-sm text-muted-foreground">{c.noExample}</p>}
      </div>
      {question.attempts.length > 0 && <div className="grid gap-2">
        <h3 className="text-sm font-medium">{c.saved}</h3>
        <ol aria-label={c.saved} className="grid gap-2">{question.attempts.map(attempt => <li key={attempt.id} className="whitespace-pre-wrap break-words rounded-2xl border px-4 py-3 text-sm leading-relaxed">{attempt.answer}</li>)}</ol>
      </div>}
    </>}
  </article>;
}

function TimerRing({ left }: { left: number | null }) {
  const circ = 2 * Math.PI * 8, frac = left === null ? 0 : left / TIMER_SECONDS;
  if (left === null) return <Timer className="size-4" aria-hidden="true" />;
  return <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden="true">
    <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2.5" className="stroke-border" />
    <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)}
      className={cn('transition-[stroke-dashoffset] duration-1000 ease-linear', left <= URGENT_SECONDS ? 'stroke-warning' : 'stroke-primary')} />
  </svg>;
}

// Pops once when a question turns ready.
function ReadyBurst() {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (!reducedMotion()) el.current?.animate([{ opacity: 0, transform: 'scale(0.4) rotate(-30deg)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }); }, []);
  return <span ref={el} className="inline-flex items-center gap-1"><Check className="size-4 text-success" aria-hidden="true" /><GemSparkle className="size-3.5" /></span>;
}

function answerFeedback(feedback: PracticeFeedback | null) {
  return feedback?.status === 'done' && feedback.kind === 'answer' ? feedback : undefined;
}

function Points({ title, items, open = false }: { title: string; items: string[]; open?: boolean }) {
  if (!items.length) return null;
  return <details open={open} className="group grid gap-2">
    <summary className="flex w-fit cursor-pointer list-none items-center gap-2 text-sm font-medium text-primary hover:underline">{title}<ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
    <ul className="mt-2 grid max-w-[70ch] gap-2 text-sm leading-relaxed">{items.map(item => <li key={item} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span className="min-w-0 break-words">{item}</span></li>)}</ul>
  </details>;
}

function ReverseRound({ c, items }: { c: PracticeCopy; items: string[] }) {
  return <section aria-labelledby="reverse-q" className="grid gap-4 rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="reverse-q" className="text-xl font-semibold">{c.reverse}</h2><AiLabel /></div>
    <p className="text-sm text-muted-foreground">{c.reverseHint}</p>
    <ol className="grid max-w-[70ch] gap-3">{items.map((item, i) => <li key={item} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2 leading-relaxed">
      <span className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold tabular-nums text-accent-foreground" aria-hidden="true">{i + 1}</span><span className="min-w-0 break-words">{item}</span>
    </li>)}</ol>
  </section>;
}
