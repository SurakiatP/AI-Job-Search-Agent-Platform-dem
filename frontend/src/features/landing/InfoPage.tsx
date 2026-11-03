import { Link, Navigate } from 'react-router';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { landingCopy } from './copy';
import { infoPages, type InfoSlug } from './infoPages';
import { PublicHeader } from './LandingNav';

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
    <main className="mx-auto grid w-full max-w-4xl gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="inline-flex min-h-11 items-center hover:text-foreground hover:underline lg:min-h-10">{locale === 'th' ? 'หน้าแรก' : 'Home'}</Link><span aria-hidden="true">/</span>
        <span aria-current="page" className="font-medium text-foreground">{slug === 'data' ? c.nav.data : c.nav.how}</span>
      </nav>
      <section className="grid max-w-2xl gap-4">
        <h1 className="text-3xl font-semibold [text-wrap:balance] sm:text-4xl">{page.title}</h1>
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{page.lead}</p>
      </section>
      {page.sections.map((section, s) => <section key={section.heading} aria-labelledby={`sec-${s}`} className="grid gap-4">
        <h2 id={`sec-${s}`} className="text-2xl font-semibold">{section.heading}</h2>
        <ul className="grid divide-y rounded-xl border bg-card">
          {section.items.map(item => <li key={item.title} className="grid gap-1 px-4 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6 sm:px-6">
            <h3 className="text-base font-semibold leading-snug">{item.title}</h3>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          </li>)}
        </ul>
      </section>)}
      <div className="grid gap-4 border-t pt-6">
        <p className="max-w-prose text-base text-foreground">{page.note}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">{cta}<Link to="/docs" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline lg:min-h-10">{locale === 'th' ? 'อ่านคู่มือการใช้งาน' : 'Read the user manual'}</Link></div>
      </div>
    </main>
  </div>;
}
