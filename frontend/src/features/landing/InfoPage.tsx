import { Link, Navigate } from 'react-router';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { landingCopy } from './copy';
import { infoPages, type InfoSlug } from './infoPages';
import { PublicHeader } from './LandingNav';
import { Rise } from './FeaturePage';
import { Tick } from './Reveal';

/** The two menu explainers (/how-it-works, /data): sections of short titled points. Text lives in infoPages.ts. */
export function InfoPage({ slug }: { slug: InfoSlug }) {
  const { locale } = useLocale();
  const status = useOwnerSession().status;
  const c = landingCopy[locale], page = infoPages[locale][slug];
  if (!page) return <Navigate to="/" replace />;
  const cta = status === 'ready'
    ? <Button asChild size="lg"><Link to="/app/projects">{c.openApp}</Link></Button>
    : status !== 'loading' && <Button asChild size="lg"><Link to="/signup">{c.cta}</Link></Button>;
  return <div className="min-h-svh text-foreground">
    <PublicHeader />
    <main className="mx-auto grid w-full max-w-4xl gap-12 px-4 py-8 sm:px-6 sm:py-12">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="inline-flex min-h-11 items-center hover:text-foreground hover:underline lg:min-h-10">{locale === 'th' ? 'หน้าแรก' : 'Home'}</Link><span aria-hidden="true">/</span>
        <span aria-current="page" className="font-medium text-foreground">{slug === 'data' ? c.nav.data : c.nav.how}</span>
      </nav>
      <section className="ambient-surface grid max-w-4xl gap-4 rounded-3xl border bg-card/60 p-6 sm:p-10">
        <h1 className="max-w-3xl font-heading text-4xl font-semibold leading-tight tracking-tight [text-wrap:balance] sm:text-5xl">{page.title}</h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{page.lead}</p>
      </section>
      {page.sections.map((section, s) => {
        const flow = slug === 'how-it-works' && s === 1;
        return <section key={section.heading} aria-labelledby={`sec-${s}`} className="grid gap-6">
          <h2 id={`sec-${s}`} className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{section.heading}</h2>
          {flow
            ? <ol className="relative grid gap-4 before:absolute before:inset-y-6 before:left-5 before:w-px before:bg-border">
              {section.items.map((item, i) => <li key={item.title} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4">
                <span aria-hidden="true" className="relative z-10 grid size-10 place-items-center rounded-full bg-primary font-heading text-base font-semibold text-primary-foreground shadow-[var(--shadow-soft)] ring-4 ring-background">{i + 1}</span>
                <Rise i={i} className="min-w-0 rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
                  <h3 className="break-words text-base font-semibold leading-snug">{item.title.replace(/^\d+\.\s*/, '')}</h3>
                  <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </Rise>
              </li>)}
            </ol>
            : slug === 'data'
              ? <ul className="grid gap-4">
                {section.items.map((item, i) => <li key={item.title} className="grid"><Rise i={i} className="grid gap-2 rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-8 sm:p-6">
                  <h3 className="flex min-w-0 items-start gap-3 break-words text-base font-semibold leading-snug"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-primary"><Tick className="size-3" /></span>{item.title}</h3>
                  <p className="min-w-0 break-words text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </Rise></li>)}
              </ul>
              : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                {section.items.map((item, i) => <li key={item.title} className={`grid ${section.items.length % 3 === 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}><Rise i={i} className="h-full rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
                  <h3 className="break-words text-base font-semibold leading-snug">{item.title}</h3>
                  <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </Rise></li>)}
              </ul>}
        </section>;
      })}
      <div className="gem-border grid gap-4 rounded-3xl p-6 shadow-[var(--shadow-lift)] sm:p-8">
        <p className="flex items-start gap-3 text-base"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Tick className="size-3" /></span><span className="min-w-0 break-words">{page.note}</span></p>
        <div className="flex flex-wrap items-center gap-3">{cta}<Button asChild size="lg" variant="outline"><Link to="/docs">{locale === 'th' ? 'ดูคู่มือ' : 'Read the guide'}</Link></Button></div>
      </div>
    </main>
  </div>;
}
