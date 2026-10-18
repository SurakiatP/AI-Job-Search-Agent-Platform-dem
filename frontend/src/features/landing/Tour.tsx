import { useLocale } from '../../app/providers';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { landingCopy } from './copy';
import { StepPanel } from './LandingPreview';

/** A compact five-step product tour using the standard, keyboard-operable tabs pattern. */
export function Tour() {
  const { locale } = useLocale();
  const c = landingCopy[locale];

  return <section id="how" aria-labelledby="how-title" className="scroll-mt-16">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <h2 id="how-title" className="mb-6 text-2xl font-semibold not-italic sm:mb-8 sm:text-3xl">{c.tourTitle}</h2>
      <Tabs defaultValue="0" className="min-w-0">
        <TabsList aria-label={c.tourLabel} className="grid h-auto w-full grid-cols-2 gap-1 bg-muted p-1 sm:grid-cols-5">
          {c.steps.map((step, index) => <TabsTrigger key={step.tab} value={String(index)} className="min-h-10 min-w-0 px-2 text-xs leading-snug sm:px-3 sm:text-sm">{step.tab}</TabsTrigger>)}
        </TabsList>
        {c.steps.map((step, index) => <TabsContent key={step.tab} value={String(index)} className="mt-4 rounded-xl border bg-card p-4 sm:mt-5 sm:p-6">
          <div className="grid min-w-0 items-center gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-8">
            <div className="grid content-start gap-3">
              <h3 className="text-xl font-semibold leading-snug not-italic sm:text-2xl">{step.title}</h3>
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">{step.body}</p>
            </div>
            <div className="min-w-0"><StepPanel index={index} /></div>
          </div>
        </TabsContent>)}
      </Tabs>
    </div>
  </section>;
}
