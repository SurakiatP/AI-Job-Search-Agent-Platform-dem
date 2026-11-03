import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { landingCopy } from './copy';
import { featureSlugs } from './featurePages';
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

  return <section id="how" aria-labelledby="how-title" className="mt-16 scroll-mt-16 sm:mt-24">
    <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:gap-8 sm:px-6">
      <h2 id="how-title" className="text-2xl font-semibold not-italic sm:text-3xl">{c.tourTitle}</h2>
      <Tabs orientation={wide ? 'vertical' : 'horizontal'} defaultValue="0" className="grid min-w-0 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <TabsList aria-label={c.tourLabel} className="segmented grid h-auto w-full grid-cols-2 gap-1 border-b-0 p-1 sm:grid-cols-3 lg:flex lg:flex-col lg:items-stretch lg:self-start">
          {c.steps.map((step, index) => <TabsTrigger key={step.tab} value={String(index)} className="min-h-11 min-w-0 justify-start whitespace-normal rounded-md border-b-0 px-3 text-left data-[state=active]:text-foreground text-sm leading-snug lg:min-h-10">{step.tab}</TabsTrigger>)}
        </TabsList>
        {c.steps.map((step, index) => <TabsContent key={step.tab} value={String(index)} className="mt-0 min-w-0">
          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] xl:items-start">
            <div className="grid content-start gap-3">
              <h3 className="text-xl font-semibold leading-snug not-italic sm:text-2xl">{step.title}</h3>
              <p className="max-w-prose text-base text-muted-foreground">{step.body}</p>
              <Link to={`/features/${featureSlugs[index]}`} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline lg:min-h-10">{c.nav.learnMore}<ArrowRight className="size-4" aria-hidden="true" /></Link>
            </div>
            <div className="min-w-0"><StepPanel index={index} /></div>
          </div>
        </TabsContent>)}
      </Tabs>
    </div>
  </section>;
}
