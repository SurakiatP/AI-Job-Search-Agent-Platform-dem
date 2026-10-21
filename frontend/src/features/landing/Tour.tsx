import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useLocale } from '../../app/providers';
import { cn } from '@/lib/utils';
import { landingCopy } from './copy';
import { featureSlugs } from './featurePages';
import { StepPanel } from './LandingPreview';
import { prefersReducedMotion } from './Reveal';

const HEADER = 57.6; // px: the sticky site header (3.6rem); the pinned stage starts right under it
const PER_STEP = 60; // svh of scrolling per step on a wide screen

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return match;
}

/** The product tour. On a wide screen the section pins under the header and scrolling DOWN slides the nine steps
 *  SIDEWAYS (scroll-linked, no snapping); the tab strip and its progress line follow. On phones, short screens and with
 *  reduced motion the steps simply stack and the strip is sticky and follows the scroll. The strip links jump to a step. */
export function Tour() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  const n = c.steps.length;
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const roomy = useMedia('(min-width: 1024px) and (min-height: 640px)');
  const slide = roomy && !reduced;
  const [active, setActive] = useState(0);
  const outerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const articles = useRef<(HTMLElement | null)[]>([]);

  // Wide screen: vertical scroll position -> progress 0..1 -> sideways offset of the track.
  useEffect(() => {
    if (!slide) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const outer = outerRef.current, stage = outer?.firstElementChild as HTMLElement | undefined, track = trackRef.current;
      if (!outer || !stage || !track) return;
      const range = outer.offsetHeight - stage.offsetHeight;
      const p = range > 0 ? Math.min(1, Math.max(0, (HEADER - outer.getBoundingClientRect().top) / range)) : 0;
      track.style.transform = `translate3d(${-p * (n - 1) * (100 / n)}%, 0, 0)`;
      if (barRef.current) barRef.current.style.transform = `scaleX(${(1 + p * (n - 1)) / n})`;
      setActive(Math.round(p * (n - 1)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [slide, n]);

  // Stacked: the step crossing the middle band of the screen is the one being read.
  useEffect(() => {
    if (slide || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
    }, { rootMargin: '-45% 0px -50% 0px' });
    articles.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, [slide, n]);

  // Keep the current tab visible inside the strip when the strip itself scrolls sideways. Scrolls the strip only.
  useEffect(() => {
    const strip = stripRef.current, tab = strip?.children[active] as HTMLElement | undefined;
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
    const offset = tab.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    strip.scrollTo({ left: offset - (strip.clientWidth - tab.offsetWidth) / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [active]);

  const jump = useCallback((index: number) => {
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    const outer = outerRef.current;
    if (slide && outer) {
      const stage = outer.firstElementChild as HTMLElement;
      const range = outer.offsetHeight - stage.offsetHeight;
      scrollTo({ top: outer.getBoundingClientRect().top + scrollY - HEADER + (index / (n - 1)) * range, behavior });
    } else articles.current[index]?.scrollIntoView({ behavior, block: 'start' });
  }, [slide, n]);

  const strip = <nav aria-label={c.tourLabel} className={cn('bg-background/95 pb-3 pt-2', !slide && 'sticky top-[3.6rem] z-[9] -mx-4 px-4 backdrop-blur-sm sm:-mx-6 sm:px-6')}>
    <ul ref={stripRef} className="flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1 [scrollbar-width:none] xl:rounded-full [&::-webkit-scrollbar]:hidden">
      {c.steps.map((step, index) => <li key={step.tab} className="min-w-fit flex-1">
        <a href={`#step-${index}`} aria-current={index === active ? 'step' : undefined}
          onClick={event => { event.preventDefault(); jump(index); }}
          className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl px-3 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground aria-[current=step]:bg-card aria-[current=step]:font-semibold aria-[current=step]:text-foreground aria-[current=step]:shadow-sm xl:rounded-full">
          {step.tab}
        </a>
      </li>)}
    </ul>
    <div aria-hidden="true" className="mx-1 mt-2 h-0.5 overflow-hidden rounded-full bg-border">
      <div ref={barRef} className={cn('h-full origin-left rounded-full bg-primary', !slide && 'transition-transform duration-500 ease-out')} style={slide ? undefined : { transform: `scaleX(${(active + 1) / n})` }} />
    </div>
  </nav>;

  const card = (step: (typeof c.steps)[number], index: number) => <article key={step.tab} id={`step-${index}`} data-index={index} ref={el => { articles.current[index] = el; }}
    inert={slide && index !== active ? true : undefined}
    className={cn('min-w-0 rounded-2xl border bg-card p-4 sm:p-7', slide ? 'max-h-full w-full overflow-y-auto' : 'scroll-mt-32')}>
    <div className="grid min-w-0 items-center gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
      <div className="grid content-start gap-3">
        <span aria-hidden="true" className={cn('grid size-9 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors', index === active ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground')}>{index + 1}</span>
        <h3 className="text-xl font-semibold leading-snug not-italic sm:text-2xl">{step.title}</h3>
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground">{step.body}</p>
        <Link to={`/features/${featureSlugs[index]}`} className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">{c.nav.learnMore} →</Link>
      </div>
      <div className="min-w-0"><StepPanel index={index} /></div>
    </div>
  </article>;

  return <section id="how" aria-labelledby="how-title" className="scroll-mt-16">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <h2 id="how-title" className="mb-5 text-2xl font-semibold not-italic sm:text-3xl">{c.tourTitle}</h2>
      {slide
        ? <div id="how-scroll" ref={outerRef} style={{ height: `calc(${(n - 1) * PER_STEP}svh + 100svh - ${HEADER}px)` }}>
            <div className="sticky grid grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden" style={{ top: HEADER, height: `calc(100svh - ${HEADER}px)` }}>
              {strip}
              <div className="min-h-0 overflow-hidden pb-4">
                <div ref={trackRef} className="flex h-full will-change-transform" style={{ width: `${n * 100}%` }}>
                  {c.steps.map((step, index) => <div key={step.tab} className="flex h-full min-w-0 items-center" style={{ width: `${100 / n}%`, paddingRight: index < n - 1 ? 24 : 0 }}>{card(step, index)}</div>)}
                </div>
              </div>
            </div>
          </div>
        : <>
            {strip}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 pt-2 sm:gap-8">{c.steps.map(card)}</div>
          </>}
    </div>
  </section>;
}
