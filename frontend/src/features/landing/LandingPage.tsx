import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ChevronDown } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { landingCopy } from './copy';
import { DemoCard } from './LandingPreview';
import { PublicHeader } from './LandingNav';
import { Tick } from './Reveal';
import { Tour } from './Tour';
import './landing.css';

const wrap = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
const footerLink = 'inline-flex min-h-11 items-center hover:text-foreground hover:underline lg:min-h-10';

export function LandingPage() {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const c = landingCopy[locale];
  // Signed-in visitors get one "Open app" button instead of sign-up / log-in; nothing shows until the session is known.
  const status = useOwnerSession().status;
  const cta = (size: 'sm' | 'lg') => status === 'ready'
    ? <Button asChild size={size}><Link to="/app/projects">{c.openApp}</Link></Button>
    : status === 'loading' ? null : <Button asChild size={size}><Link to="/signup">{size === 'sm' ? c.signup : c.cta}</Link></Button>;
  return <div className="landing text-foreground">
    <a href="#main" className="skip-link">{t('skipToContent')}</a>
    <PublicHeader />
    <main id="main" tabIndex={-1} className="grid grid-cols-[minmax(0,1fr)] pb-12 focus-visible:outline-none sm:pb-16">
      <section className={`${wrap} grid items-center gap-10 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12`}>
        <div className="grid content-start justify-items-start gap-6">
          <h1 className="landing-headline max-w-2xl not-italic [text-wrap:balance]">
            <span className="block">{c.headlineA.split('AI').flatMap((part, index) => index === 0 ? [part] : [<span key={index} className="landing-ai">AI</span>, part])}</span><span>{c.headlineB}</span>
          </h1>
          <p className="max-w-xl text-base text-muted-foreground sm:text-lg">{c.sub}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {cta('lg')}
            <a href="#how" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline lg:min-h-10">{c.secondary}<ArrowDown className="size-4" aria-hidden="true" /></a>
          </div>
          <ul aria-label={c.controlTitle} className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {c.control.map(item => <li key={item} className="flex items-center gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary-fill text-primary-fill-foreground"><Tick className="size-3" /></span>{item}
            </li>)}
          </ul>
        </div>
        <div className="min-w-0"><DemoCard /></div>
      </section>

      <section id="steps" aria-labelledby="steps-title" className={`${wrap} mt-16 grid scroll-mt-16 gap-6 sm:mt-20`}>
        <h2 id="steps-title" className="text-2xl font-semibold not-italic sm:text-3xl">{c.stepsTitle}</h2>
        <ol className="grid gap-8 border-t pt-8 md:grid-cols-3 md:gap-6">
          {c.how.map((step, index) => <li key={step.title} className="grid content-start gap-2">
            <span aria-hidden="true" className="font-heading text-4xl leading-none text-primary">{index + 1}</span>
            <h3 className="text-xl font-semibold leading-snug not-italic">{step.title}</h3>
            <p className="max-w-prose text-base text-muted-foreground">{step.body}</p>
          </li>)}
        </ol>
        <p className="border-t pt-4 text-sm text-muted-foreground">{c.noSubmit}</p>
      </section>

      <div className={`${wrap} mt-16 sm:mt-24`}>
        <div className="border-y py-12 sm:py-16">
          <p className="max-w-3xl font-heading text-3xl leading-snug sm:text-4xl lg:text-5xl">
            <span className="block">{c.tagline[0]}</span>
            <span className="block">{c.tagline[1]}</span>
          </p>
        </div>
      </div>

      <Tour />

      <div className="mt-16 bg-surface-tint py-12 sm:mt-20 sm:py-16">
      <section id="data" className={`${wrap} grid scroll-mt-16 gap-8`} aria-labelledby="diff-title">
        <h2 id="diff-title" className="max-w-2xl text-2xl font-semibold not-italic sm:text-3xl">{c.diffTitle}</h2>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
          <section aria-labelledby="local-title" className="grid content-start gap-4">
            <h3 id="local-title" className="text-xl font-semibold not-italic">{c.local.title}</h3>
            <p className="max-w-prose text-base text-muted-foreground">{c.local.body}</p>
            <ul className="grid gap-3 text-base">
              {[...c.local.rows, `${c.local.submit} · ${c.local.submitNote}`].map(row => <li key={row} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary-fill text-primary-fill-foreground"><Tick className="size-3.5" /></span>{row}
              </li>)}
            </ul>
          </section>
          <section aria-labelledby="agent-title" className="grid content-start gap-4 rounded-xl border bg-card p-6 sm:p-8">
            <h3 id="agent-title" className="text-xl font-semibold not-italic">{c.agent.title}</h3>
            <p className="max-w-prose text-base text-muted-foreground">{c.agent.body}</p>
            <Badge variant="outline" className="w-fit">{c.panel.sample}</Badge>
            <ol aria-label={c.agent.flow} className="grid gap-3">
              <li className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-4 py-3 text-sm">
                <span className="font-medium">{c.agent.token}</span><span className="text-muted-foreground">· {c.agent.scopes}</span>
              </li>
              <li className="flex items-center gap-2 rounded-lg bg-warning/12 px-4 py-3 text-sm font-medium text-warning">
                {c.agent.request}
              </li>
              <li className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-4 py-3 text-sm">
                <span className="rounded-md bg-primary-fill px-3 py-1 font-medium text-primary-fill-foreground">{c.agent.approve}</span>
                <span className="rounded-md border bg-card px-3 py-1 font-medium">{c.agent.reject}</span>
              </li>
            </ol>
          </section>
        </div>
      </section>
      </div>

      <section id="faq" aria-labelledby="faq-title" className={`${wrap} mt-16 grid scroll-mt-16 gap-6 sm:mt-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16`}>
        <h2 id="faq-title" className="text-2xl font-semibold not-italic sm:text-3xl">{c.faqTitle}</h2>
        <div className="grid rounded-xl border bg-card px-5">
          {c.faq.map(item => <details key={item.q} className="group border-b last:border-b-0">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              {item.q}<ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="max-w-prose pb-4 text-base text-muted-foreground">{item.a}</p>
          </details>)}
        </div>
      </section>

      <section aria-labelledby="closing-title" className={`${wrap} mt-16 sm:mt-20`}>
        <div className="grid gap-6 rounded-xl border bg-card p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="grid gap-2">
            <h2 id="closing-title" className="max-w-2xl text-2xl font-semibold not-italic sm:text-3xl">{c.closing}</h2>
            <p className="max-w-xl text-muted-foreground">{c.closingSub}</p>
          </div>
          <div>{cta('lg')}</div>
        </div>
      </section>
    </main>
    <footer className={`${wrap} grid gap-4 border-t py-8 text-sm text-muted-foreground sm:flex sm:items-center sm:justify-between`}>
      <nav aria-label={c.footer.label}>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          <li><Link to="/how-it-works" className={footerLink}>{c.nav.how}</Link></li>
          <li><Link to="/data" className={footerLink}>{c.nav.data}</Link></li>
          <li><Link to="/docs" className={footerLink}>{c.docs}</Link></li>
        </ul>
      </nav>
      <span>AI Job Search Agent Platform · {new Date().getFullYear()}</span>
    </footer>
  </div>;
}
