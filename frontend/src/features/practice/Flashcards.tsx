// Technical round as Quizlet-style flashcards (CR-IVP-01 FR-IVP-10): flip, know / still learning piles, keys and swipe.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, RotateCcw, Shuffle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { BusyNote } from '@/components/BusyNote';
import { Button } from '@/components/ui/button';
import { AiLabel } from '@/components/AiMark';
import type { PracticeQuestion } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import type { PracticeCopy } from './copy';

type Rating = 'know' | 'learning';
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Flashcards({ cards, c, onRate, onCheck }: { cards: PracticeQuestion[]; c: PracticeCopy; onRate: (id: string, rating: Rating) => void; onCheck?: (id: string, answer: string) => Promise<void> }) {
  const [deck, setDeck] = useState(() => cards.map(card => card.id));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [leaving, setLeaving] = useState<Rating | null>(null);
  const [done, setDone] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; moved: boolean } | null>(null);
  const byId = new Map(cards.map(card => [card.id, card]));
  const card = byId.get(deck[index]);
  const known = cards.filter(item => item.card_rating === 'know').length;
  const learning = cards.filter(item => item.card_rating === 'learning');

  useEffect(() => { stage.current?.focus({ preventScroll: true }); }, []);
  const go = useCallback((to: number) => { setFlipped(false); setIndex(Math.max(0, Math.min(deck.length - 1, to))); }, [deck.length]);
  const rate = useCallback((rating: Rating) => {
    if (!card || leaving) return;
    onRate(card.id, rating);
    setLeaving(rating);
    window.setTimeout(() => {
      setLeaving(null); setFlipped(false);
      if (index + 1 >= deck.length) setDone(true); else setIndex(index + 1);
    }, reduced() ? 0 : 220);
  }, [card, deck.length, index, leaving, onRate]);
  const restart = (ids: string[]) => { setDeck(ids); setIndex(0); setFlipped(false); setDone(false); window.setTimeout(() => stage.current?.focus({ preventScroll: true }), 0); };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (done || !target || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName) || target.isContentEditable) return;
      if (event.key === ' ') { event.preventDefault(); setFlipped(value => !value); }
      else if (event.key === 'ArrowRight') go(index + 1);
      else if (event.key === 'ArrowLeft') go(index - 1);
      else if (event.key === '1') rate('learning');
      else if (event.key === '2') rate('know');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, go, index, rate]);

  const pile = (label: string, n: number, tone: 'learning' | 'know') => <div className="hidden justify-items-center gap-2 text-center text-sm text-muted-foreground md:grid" aria-hidden="true">
    <span className="relative block h-16 w-24">{[2, 1, 0].map(depth => <span key={depth} className={cn('absolute inset-0 rounded-lg border bg-card transition-opacity', n === 0 && depth === 0 ? 'border-dashed bg-transparent' : depth >= Math.min(n, 3) && 'opacity-0', tone === 'know' ? 'border-success/40' : 'border-warning/40')} style={{ transform: `translate(${depth * 4}px, ${-depth * 4}px)` }} />)}</span>
    <span className="text-2xl font-semibold tabular-nums text-foreground">{n}</span>{label}
  </div>;

  if (done || !card) {
    const ids = learning.map(item => item.id);
    return <section aria-labelledby="fc-done" className="grid justify-items-center gap-5 rounded-xl border bg-card px-5 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-success/15 text-success"><Check className="size-6" aria-hidden="true" /></span>
      <h3 id="fc-done" className="text-xl font-semibold">{c.roundDone}</h3>
      <dl className="flex flex-wrap justify-center gap-8 text-sm">
        <div className="grid gap-1"><dt className="text-muted-foreground">{c.know}</dt><dd className="text-3xl font-semibold tabular-nums text-success">{known}</dd></div>
        <div className="grid gap-1"><dt className="text-muted-foreground">{c.learning}</dt><dd className="text-3xl font-semibold tabular-nums text-warning">{ids.length}</dd></div>
      </dl>
      <div className="flex flex-wrap justify-center gap-2">
        {ids.length > 0 && <Button type="button" className="min-h-11" onClick={() => restart(ids)}>{c.reviewLearning(ids.length)}</Button>}
        <Button type="button" variant="outline" className="min-h-11" onClick={() => restart(cards.map(item => item.id))}><RotateCcw className="size-4" aria-hidden="true" />{c.restart}</Button>
      </div>
    </section>;
  }

  return <div className="grid gap-5">
    <div className="grid items-center gap-6 md:grid-cols-[6rem_minmax(0,1fr)_6rem]">
      {pile(c.learning, learning.length, 'learning')}
      <div ref={stage} tabIndex={-1} className="outline-none [perspective:1600px]"
        onPointerDown={event => { swipe.current = { x: event.clientX, moved: false }; }}
        onPointerMove={event => { if (swipe.current && Math.abs(event.clientX - swipe.current.x) > 12) swipe.current.moved = true; }}
        onPointerUp={event => {
          const start = swipe.current; swipe.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          if (event.pointerType !== 'mouse' && Math.abs(dx) > 80) rate(dx > 0 ? 'know' : 'learning');
          else if (!start.moved) setFlipped(value => !value);
        }}>
        <section role="group" aria-roledescription="flashcard" aria-label={`${c.card(index + 1, deck.length)} · ${card.prompt}`} key={card.id}
          data-flipped={flipped} data-leaving={leaving ?? undefined}
          className="flashcard relative h-[22rem] cursor-pointer select-none sm:h-[24rem]">
          <div className="flashcard-inner relative size-full">
            <div className="flashcard-face face-front absolute inset-0 grid grid-rows-[auto_1fr_auto] gap-3 rounded-2xl border bg-card p-5 shadow-[0_24px_48px_-28px_rgb(23_35_59/0.45)] sm:p-7" aria-hidden={flipped}>
              <div className="flex items-start justify-between gap-3"><span className="inline-flex h-7 items-center rounded-full bg-accent px-2.5 text-xs font-semibold tabular-nums text-accent-foreground">{c.card(index + 1, deck.length)}</span><AiLabel /></div>
              <p className="self-center text-balance text-center text-xl font-semibold leading-relaxed sm:text-2xl">{card.prompt}</p>
              <p className="text-center text-xs text-muted-foreground">{c.why}: {card.why} · <span className="hidden sm:inline">{c.flipHint}</span><span className="sm:hidden">{c.flipHintTouch}</span></p>
            </div>
            <div className="flashcard-face face-back absolute inset-0 grid grid-rows-[auto_1fr] gap-3 overflow-y-auto rounded-2xl border border-primary/30 bg-card p-5 shadow-[0_24px_48px_-28px_rgb(23_35_59/0.45)] sm:p-7" aria-hidden={!flipped}>
              <div className="flex items-start justify-between gap-3"><span className="text-xs font-semibold text-primary">{c.back2}</span><AiLabel /></div>
              <div className="grid content-start gap-4">
                <ul className="grid gap-2 text-base leading-relaxed">{card.key_points.map(point => <li key={point} className="flex gap-2.5"><span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span className="min-w-0 break-words">{point}</span></li>)}</ul>
                {card.model_answer && <div className="grid gap-1 rounded-lg bg-secondary p-3 text-sm"><p className="font-medium">{c.example}</p><p className="leading-relaxed">{card.model_answer}</p></div>}
              </div>
            </div>
          </div>
        </section>
      </div>
      {pile(c.know, known, 'know')}
    </div>
    <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-center">
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-accent sm:order-2 sm:w-40" aria-hidden="true"><span className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${(100 * index) / deck.length}%` }} /></span>
      <div className="grid grid-cols-2 gap-2 sm:contents">
        <Button type="button" variant="outline" className="min-h-12 border-warning/40 bg-warning/10 px-5 text-warning hover:bg-warning/15 sm:order-1" onClick={() => rate('learning')}>{c.learning}<kbd className="ms-1 hidden rounded border border-current/30 px-1.5 text-xs sm:inline">1</kbd></Button>
        <Button type="button" variant="outline" className="min-h-12 border-success/40 bg-success/10 px-5 text-success hover:bg-success/15 sm:order-3" onClick={() => rate('know')}>{c.know}<kbd className="ms-1 hidden rounded border border-current/30 px-1.5 text-xs sm:inline">2</kbd></Button>
      </div>
      <div className="flex items-center justify-center gap-1 sm:contents">
        <Button type="button" variant="ghost" size="icon" className="sm:order-first" aria-label={c.prev} disabled={index === 0} onClick={() => go(index - 1)}><ArrowLeft className="size-4" aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" size="sm" className="sm:order-last" onClick={() => restart([...deck].sort(() => Math.random() - 0.5))}><Shuffle className="size-4" aria-hidden="true" />{c.shuffle}</Button>
        <Button type="button" variant="ghost" size="icon" className="sm:order-4" aria-label={c.next} disabled={index >= deck.length - 1} onClick={() => go(index + 1)}><ArrowRight className="size-4" aria-hidden="true" /></Button>
      </div>
    </div>
    {onCheck && <CardCheck key={card.id} c={c} card={card} onCheck={answer => onCheck(card.id, answer)} />}
  </div>;
}

function CardCheck({ c, card, onCheck }: { c: PracticeCopy; card: PracticeQuestion; onCheck: (answer: string) => Promise<void> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = card.attempts[0]?.feedback;
  const verdict = latest?.status === 'done' && latest.kind === 'card' ? latest : null;
  const tone = { correct: 'text-success', partial: 'text-warning', incorrect: 'text-destructive' } as const;
  return <div className="grid justify-items-center gap-3">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
      className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {c.cardAnswerToggle}<ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden="true" /></button>
    {open && <div className="grid w-full max-w-2xl gap-2">
      <label htmlFor={`${id}-a`} className="text-sm font-medium">{c.cardAnswerLabel}</label>
      <Textarea id={`${id}-a`} rows={3} maxLength={4000} value={answer} onChange={event => setAnswer(event.target.value)} />
      <Button type="button" variant="outline" className="min-h-11 justify-self-start" busy={busy} disabled={busy || !answer.trim()}
        onClick={() => { setBusy(true); void onCheck(answer.trim()).finally(() => setBusy(false)); }}>{c.checkAnswer}</Button>
    </div>}
    {latest?.status === 'pending' && <BusyNote label={c.grading} />}
    {latest?.status === 'failed' && <p role="alert" className="text-sm text-destructive">{c.gradeFailed}</p>}
    {verdict && <div className="grid w-full max-w-2xl gap-2 rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className={cn('font-semibold', tone[verdict.verdict])}>{c.verdicts[verdict.verdict]}</p><AiLabel /></div>
      {verdict.note && <p className="leading-relaxed">{verdict.note}</p>}
      {verdict.missing.length > 0 && <div className="grid gap-1.5">
        <p className="font-medium text-muted-foreground" id={`${id}-missing`}>{c.missingPoints}</p>
        <ul aria-labelledby={`${id}-missing`} className="grid gap-1.5 leading-relaxed">{verdict.missing.map(point => <li key={point} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" /><span className="min-w-0 break-words">{point}</span></li>)}</ul>
      </div>}
    </div>}
  </div>;
}
