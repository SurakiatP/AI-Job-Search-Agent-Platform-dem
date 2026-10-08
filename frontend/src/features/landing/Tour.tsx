import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useLocale } from '../../app/providers';
import { cn } from '@/lib/utils';
import { landingCopy } from './copy';
import { StepPanel } from './LandingPreview';
import { prefersReducedMotion } from './Reveal';

/**
 * Scrollytelling tour. >=1024px: a tall container (5 x 80vh) holds a sticky two-column stage and five
 * invisible anchors; an IntersectionObserver on the anchors (viewport mid-line) picks the active step.
 * <1024px: plain vertical list, no sticky.
 */
export function Tour() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  const [active, setActive] = useState(0);
  const anchors = useRef<(HTMLDivElement | null)[]>([]);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
    }, { rootMargin: '-49% 0px -50% 0px' });
    anchors.current.forEach(a => a && io.observe(a));
    return () => io.disconnect();
  }, []);

  const go = (i: number) => {
    setActive(i);
    anchors.current[i]?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  const onKey = (e: KeyboardEvent) => {
    const last = c.steps.length - 1;
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? Math.min(active + 1, last) : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? Math.max(active - 1, 0) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (next === null) return;
    e.preventDefault();
    go(next);
    tabs.current[next]?.focus();
  };

  return <section id="how" aria-labelledby="how-title" className="scroll-mt-16">
    <div className="mx-auto max-w-6xl px-4 pb-10 text-center sm:px-6"><h2 id="how-title" className="text-3xl font-semibold not-italic">{c.tourTitle}</h2></div>

    <div className="relative mx-auto hidden h-[400vh] max-w-6xl px-6 lg:block">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col">
        {c.steps.map((s, i) => <div key={s.tab} ref={el => { anchors.current[i] = el; }} data-i={i} className="flex-1" />)}
      </div>
      <div className="sticky top-16 grid h-[calc(100svh-4rem)] grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-center gap-12">
        <div className="grid gap-8">
          <div role="tablist" aria-label={c.tourLabel} onKeyDown={onKey} className="grid grid-cols-5 gap-2">
            {c.steps.map((s, i) => <button key={s.tab} ref={el => { tabs.current[i] = el; }} role="tab" id={`tour-tab-${i}`} type="button" aria-selected={active === i} aria-controls={`tour-panel-${i}`} tabIndex={active === i ? 0 : -1} onClick={() => go(i)}
              className="grid min-h-11 content-start gap-2 rounded-md py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              <span className={cn('h-1 rounded-full transition-colors', i < active ? 'bg-primary/50' : i === active ? 'bg-primary' : 'bg-border')} />
              <span className={cn('leading-snug', i === active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{s.tab}</span>
            </button>)}
          </div>
          <div className="grid">
            {c.steps.map((s, i) => <div key={s.tab} data-active={active === i} aria-hidden={active !== i} inert={active !== i} className="landing-tstep grid content-start gap-3 [grid-area:1/1]">
              <p className="text-sm font-semibold text-primary">{`0${i + 1} · ${s.eyebrow}`}</p>
              <h3 className="text-3xl font-semibold leading-snug not-italic xl:text-4xl">{s.title}</h3>
              <p className="text-lg text-muted-foreground">{s.body}</p>
            </div>)}
          </div>
        </div>
        <div className="grid">
          {c.steps.map((s, i) => <div key={s.tab} role="tabpanel" id={`tour-panel-${i}`} aria-labelledby={`tour-tab-${i}`} data-active={active === i} aria-hidden={active !== i} inert={active !== i} className="landing-tstep self-center [grid-area:1/1]">
            <StepPanel index={i} />
          </div>)}
        </div>
      </div>
    </div>

    <ol className="mx-auto grid max-w-6xl gap-14 px-4 sm:px-6 lg:hidden">
      {c.steps.map((s, i) => <li key={s.tab} className="grid min-w-0 gap-4">
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-primary">{`0${i + 1} · ${s.eyebrow}`}</p>
          <h3 className="text-2xl font-semibold leading-snug not-italic">{s.title}</h3>
          <p className="text-muted-foreground">{s.body}</p>
        </div>
        <StepPanel index={i} />
      </li>)}
    </ol>
  </section>;
}
