import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { useLocale } from '../../app/providers';
import { PublicHeader } from '../landing/LandingNav';
import { landingCopy } from '../landing/copy';
import { docsCopy } from './copy';
import { topics } from './topics';


export function DocsPage() {
  const { locale } = useLocale();
  const c = docsCopy[locale];
  const how = landingCopy[locale].how;
  return <div className="min-h-svh text-foreground">
    <PublicHeader />
    <main className="mx-auto grid w-full max-w-4xl gap-10 px-4 py-10 sm:px-6 sm:py-12">
      <section className="grid max-w-2xl gap-3">
        <h1 className="text-3xl font-semibold sm:text-4xl">{c.title}</h1>
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{c.intro}</p>
      </section>

      <section aria-labelledby="quick-title" className="grid gap-4">
        <h2 id="quick-title" className="text-xl font-semibold">{c.quick}</h2>
        <ol className="grid gap-6 rounded-xl bg-surface-tint p-5 sm:p-6 md:grid-cols-3">
          {how.map((step, index) => <li key={step.title} className="grid content-start gap-1">
            <span aria-hidden="true" className="font-heading text-2xl leading-none text-primary">{index + 1}</span>
            <h3 className="text-base font-semibold leading-snug">{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>)}
        </ol>
      </section>

      <section aria-labelledby="topics-title" className="grid gap-4">
        <h2 id="topics-title" className="text-xl font-semibold">{c.topics}</h2>
        <ul className="grid divide-y rounded-xl border bg-card [&>li:first-child>a]:rounded-t-xl [&>li:last-child>a]:rounded-b-xl">
          {c.list.map((topic, index) => <li key={topic.title}>
            <Link to={`/docs/${topics[index].id}`} className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-4 py-4 text-foreground transition-colors hover:bg-accent/50 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:px-6">
              <span aria-hidden="true" className="pt-0.5 text-sm tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
              <span className="grid gap-1">
                <span className="text-base font-semibold leading-snug [overflow-wrap:anywhere] group-hover:text-primary">{topic.title}</span>
                <span className="text-sm leading-relaxed text-muted-foreground">{topic.body}</span>
              </span>
              <ChevronRight className="mt-0.5 size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </li>)}
        </ul>
      </section>
    </main>
  </div>;
}
