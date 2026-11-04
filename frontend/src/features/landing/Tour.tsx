import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { landingCopy } from './copy';
import { featureSlugs } from './featurePages';
import { featureIcons } from './LandingNav';
import { StepPanel } from './LandingPreview';

/** A nine-part product tour: a vertical index beside one panel (Up/Down keys, standard tabs pattern). */
export function Tour() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  // The index is a vertical list only from lg up; below that it is a grid, so arrow keys follow a horizontal tablist.
  const [wide, setWide] = useState(() => typeof matchMedia === 'function' && matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const [value, setValue] = useState('0');
  const list = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  // Magic line: one pill glides to the active tab (transform only; size is set directly, so no animated layout).
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>('[data-state=active]');
      const p = pill.current;
      if (!on || !p) return;
      p.style.width = `${on.offsetWidth}px`; p.style.height = `${on.offsetHeight}px`;
      p.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      p.dataset.ready = 'true';
    };
    place();
    const size = new ResizeObserver(place); size.observe(el);
    return () => size.disconnect();
  }, [value, wide]);

  return <section id="how" aria-labelledby="how-title" className="mt-16 scroll-mt-16 sm:mt-24">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="tour-stage grid gap-6 rounded-3xl border p-4 shadow-[var(--shadow-soft)] sm:gap-8 sm:p-8 lg:p-10">
        <h2 id="how-title" className="text-2xl font-semibold not-italic sm:text-3xl">{c.tourTitle}</h2>
        <Tabs orientation={wide ? 'vertical' : 'horizontal'} value={value} onValueChange={setValue} className="grid min-w-0 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
          <TabsList ref={list} aria-label={c.tourLabel} className="segmented relative grid h-auto w-full grid-cols-2 gap-1 border-b-0 bg-transparent p-0 sm:grid-cols-3 lg:flex lg:flex-col lg:items-stretch lg:self-start">
            <span ref={pill} aria-hidden="true" className="tour-pill pointer-events-none absolute left-0 top-0 rounded-[0.875rem] bg-card shadow-[var(--shadow-soft)]" />
            {c.steps.map((step, index) => { const Icon = featureIcons[index]; return <TabsTrigger key={step.tab} value={String(index)} className="min-h-11 min-w-0 justify-start gap-2 whitespace-normal rounded-[0.875rem] border-b-0 px-3 text-left text-sm leading-snug hover:bg-card/60 data-[state=active]:bg-transparent data-[state=active]:text-foreground lg:min-h-10"><Icon className="tour-icon size-4 shrink-0" aria-hidden="true" />{step.tab}</TabsTrigger>; })}
          </TabsList>
          {c.steps.map((step, index) => <TabsContent key={step.tab} value={String(index)} className="tour-panel mt-0 min-w-0">
            <div className="grid min-w-0 gap-6">
              <div className="tour-copy grid content-start gap-3">
                <h3 className="text-xl font-semibold leading-snug not-italic sm:text-2xl">{step.title}</h3>
                <p className="max-w-prose text-base text-muted-foreground">{step.body}</p>
                <Link to={`/features/${featureSlugs[index]}`} className="group inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline lg:min-h-10">{c.nav.learnMore}<ArrowRight className="size-4 transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5" aria-hidden="true" /></Link>
              </div>
              <div className="tour-card gem-border min-w-0 rounded-2xl p-1 shadow-[var(--shadow-lift)]"><StepPanel index={index} /></div>
            </div>
          </TabsContent>)}
        </Tabs>
      </div>
    </div>
  </section>;
}
