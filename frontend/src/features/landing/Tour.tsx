import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useLocale } from '../../app/providers';
import { cn } from '@/lib/utils';
import { landingCopy } from './copy';
import { featureSlugs } from './featurePages';
import { StepPanel } from './LandingPreview';
import { prefersReducedMotion } from './Reveal';

// Each step belongs to one journey stage, so its number chip wears that stage's colour (same tokens as the app sidebar).
const stageOf = ['cv', 'cv', 'search', 'evaluate', 'evaluate', 'docs', 'track', 'search', 'brand'] as const;

/** The product tour as one long read. The tab strip stays pinned under the header and follows the page scroll:
 *  the step crossing the middle of the screen is the current one. The strip's links jump to a step. */
export function Tour() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  const [active, setActive] = useState(0);
  const stripRef = useRef<HTMLUListElement>(null);
  const articles = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    // A thin band across the middle of the viewport: whichever step is inside it is the one being read.
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
    }, { rootMargin: '-45% 0px -50% 0px' });
    articles.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, [c.steps.length]);

  // Keep the current tab visible inside the strip when the strip scrolls sideways (phones). Scrolls the strip only, never the page.
  useEffect(() => {
    const strip = stripRef.current;
    const tab = strip?.children[active] as HTMLElement | undefined;
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
    const offset = tab.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    strip.scrollTo({ left: offset - (strip.clientWidth - tab.offsetWidth) / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [active]);

  const jump = (index: number) => articles.current[index]?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });

  return <section id="how" aria-labelledby="how-title" className="scroll-mt-16">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <h2 id="how-title" className="mb-5 text-2xl font-semibold not-italic sm:text-3xl">{c.tourTitle}</h2>
      <nav aria-label={c.tourLabel} className="sticky top-[3.6rem] z-[9] -mx-4 bg-background/95 px-4 pb-3 pt-2 backdrop-blur-sm sm:-mx-6 sm:px-6">
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
          <div className="h-full origin-left rounded-full bg-primary transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${(active + 1) / c.steps.length})` }} />
        </div>
      </nav>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 pt-2 sm:gap-8">
        {c.steps.map((step, index) => <article key={step.tab} id={`step-${index}`} data-index={index} ref={el => { articles.current[index] = el; }}
          className="min-w-0 scroll-mt-32 rounded-2xl border bg-card p-4 sm:p-7">
          <div className="grid min-w-0 items-center gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
            <div className="grid content-start gap-3">
              <span aria-hidden="true" data-stage={stageOf[index]} className={cn('grid size-9 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors', index === active ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground')}>{index + 1}</span>
              <h3 className="text-xl font-semibold leading-snug not-italic sm:text-2xl">{step.title}</h3>
              <p className="max-w-prose text-base leading-relaxed text-muted-foreground">{step.body}</p>
              <Link to={`/features/${featureSlugs[index]}`} className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">{c.nav.learnMore} →</Link>
            </div>
            <div className="min-w-0"><StepPanel index={index} /></div>
          </div>
        </article>)}
      </div>
    </div>
  </section>;
}
