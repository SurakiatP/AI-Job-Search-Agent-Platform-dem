import { Tick } from './Reveal';
import { Link, Navigate } from 'react-router';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Header } from '../../components/Header';
import { Button } from '../../components/ui/button';
import { landingCopy } from './copy';
import { infoPages, type InfoSlug } from './infoPages';
import { LandingMenu, LandingNav } from './LandingNav';

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
    <Header menu={<LandingMenu signedOut={status !== 'ready' && status !== 'loading'} />} nav={<LandingNav />} actions={<>
      {status !== 'ready' && status !== 'loading' && <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex"><Link to="/login">{c.login}</Link></Button>}
      {status === 'ready' ? <Button asChild size="sm"><Link to="/app/projects">{c.openApp}</Link></Button> : status !== 'loading' && <Button asChild size="sm"><Link to="/signup">{c.signup}</Link></Button>}
    </>} />
    <main className="mx-auto grid w-full max-w-4xl gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground hover:underline">{locale === 'th' ? 'หน้าแรก' : 'Home'}</Link><span aria-hidden="true">/</span>
        <span aria-current="page" className="font-medium text-foreground">{slug === 'data' ? c.nav.data : c.nav.how}</span>
      </nav>
      <section className="grid max-w-2xl gap-4">
        <h1 className="text-3xl font-semibold leading-tight [text-wrap:balance] sm:text-4xl">{page.title}</h1>
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{page.lead}</p>
      </section>
      {page.sections.map((section, s) => <section key={section.heading} aria-labelledby={`sec-${s}`} className="grid gap-4">
        <h2 id={`sec-${s}`} className="text-2xl font-semibold">{section.heading}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {section.items.map(item => <li key={item.title} className="grid content-start gap-1.5 rounded-xl border bg-card p-5">
            <h3 className="text-base font-semibold leading-snug">{item.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          </li>)}
        </ul>
      </section>)}
      <p className="flex items-start gap-2.5 border-t pt-4 text-sm text-muted-foreground"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Tick className="size-3" /></span><span>{page.note}</span></p>
      <div className="flex flex-wrap gap-3">{cta}<Button asChild size="lg" variant="outline"><Link to="/docs">{locale === 'th' ? 'ดูคู่มือ' : 'Read the guide'}</Link></Button></div>
    </main>
  </div>;
}
