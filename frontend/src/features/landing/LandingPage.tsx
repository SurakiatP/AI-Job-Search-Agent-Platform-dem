import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { Plug, ShieldCheck } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Header } from '../../components/Header';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { landingCopy } from './copy';
import { DemoCard } from './LandingPreview';
import { LandingMenu, LandingNav } from './LandingNav';
import { Stagger, Tick } from './Reveal';
import { Tour } from './Tour';
import './landing.css';

const wrap = 'mx-auto w-full max-w-6xl px-4 sm:px-6';

/** What stays in the visitor's hands, each with a drawn tick. */
function Controls({ items, label }: { items: readonly string[]; label: string }) {
  return <Stagger aria-label={label} className="grid gap-2 text-sm">
    {items.map((item, index) => <li key={item} style={{ '--i': index } as CSSProperties} className="flex items-center gap-2.5">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Tick className="size-3" /></span>{item}
    </li>)}
  </Stagger>;
}

export function LandingPage() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  // Signed-in visitors get one "Open app" button instead of sign-up / log-in; nothing shows until the session is known.
  const status = useOwnerSession().status;
  const cta = (size: 'sm' | 'lg') => status === 'ready'
    ? <Button asChild size={size}><Link to="/app/projects">{c.openApp}</Link></Button>
    : status === 'loading' ? null : <Button asChild size={size}><Link to="/signup">{size === 'sm' ? c.signup : c.cta}</Link></Button>;
  return <div className="landing text-foreground">
    <Header menu={<LandingMenu signedOut={status !== 'ready' && status !== 'loading'} />} nav={<LandingNav />} actions={<>
      {status !== 'ready' && status !== 'loading' && <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex"><Link to="/login">{c.login}</Link></Button>}
      {cta('sm')}
    </>} />
    <main className="grid grid-cols-[minmax(0,1fr)] gap-16 pb-12 sm:gap-20 sm:pb-16">
      <section className={`${wrap} grid items-center gap-10 pt-10 sm:pt-14 lg:grid-cols-2 lg:gap-12 lg:pt-16`}>
        <div className="grid content-start justify-items-start gap-5">
          <h1 className="landing-headline max-w-2xl not-italic [text-wrap:balance]">
            <span className="block">{c.headlineA.split('AI').flatMap((part, index) => index === 0 ? [part] : [<span key={index} className="landing-ai">AI</span>, part])}</span><span>{c.headlineB}</span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">{c.sub}</p>
          <div className="flex flex-wrap items-center gap-3">
            {cta('lg')}
            <Button asChild size="lg" variant="outline"><a href="#steps">{c.secondary}</a></Button>
          </div>
          <Controls items={c.control} label={c.controlTitle} />
        </div>
        <div className="min-w-0"><DemoCard /></div>
      </section>

      <section id="steps" aria-labelledby="steps-title" className={`${wrap} grid scroll-mt-16 gap-6`}>
        <h2 id="steps-title" className="text-2xl font-semibold not-italic sm:text-3xl">{c.stepsTitle}</h2>
        <Stagger as="ol" className="grid gap-6 md:grid-cols-3 md:gap-0">
            {c.how.map((step, index) => <li key={step.title} style={{ '--i': index } as CSSProperties} className="grid grid-cols-[2rem_minmax(0,1fr)] content-start gap-x-3 gap-y-1 md:border-l md:px-6 md:first:border-l-0 md:first:pl-0">
              <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{index + 1}</span>
              <h3 className="self-center text-lg font-semibold leading-snug not-italic">{step.title}</h3>
              <p className="col-start-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{step.body}</p>
            </li>)}
        </Stagger>
        <p className="flex items-start gap-2.5 border-t pt-4 text-sm text-muted-foreground"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Tick className="size-3" /></span><span>{c.noSubmit}</span></p>
      </section>

      <Tour />

      <section id="data" className={`${wrap} grid scroll-mt-16 gap-8`} aria-labelledby="diff-title">
        <h2 id="diff-title" className="max-w-2xl text-2xl font-semibold not-italic sm:text-3xl">{c.diffTitle}</h2>
        <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
          <section aria-labelledby="local-title" className="grid content-start gap-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground"><ShieldCheck className="size-5" /></span>
            <div className="grid gap-2">
              <h3 id="local-title" className="text-xl font-semibold not-italic sm:text-2xl">{c.local.title}</h3>
              <p className="max-w-prose text-base leading-relaxed text-muted-foreground">{c.local.body}</p>
            </div>
            <ul className="grid gap-3 border-t pt-5 text-base">
              {[...c.local.rows, `${c.local.submit} · ${c.local.submitNote}`].map(row => <li key={row} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Tick className="size-3.5" /></span>{row}
              </li>)}
            </ul>
          </section>
          <section aria-labelledby="agent-title" className="grid content-start gap-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground"><Plug className="size-5" /></span>
            <div className="grid gap-2">
              <h3 id="agent-title" className="text-xl font-semibold not-italic sm:text-2xl">{c.agent.title}</h3>
              <p className="max-w-prose text-base leading-relaxed text-muted-foreground">{c.agent.body}</p>
            </div>
            <div className="grid gap-3 border-t pt-5">
              <Badge variant="outline" className="w-fit">{c.panel.sample}</Badge>
              <ol aria-label={c.agent.flow} className="grid gap-3">
                <li className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground" aria-hidden="true">1</span>
                  <span className="font-medium">{c.agent.token}</span><span className="text-muted-foreground">· {c.agent.scopes}</span>
                </li>
                <li className="flex items-center gap-2 rounded-xl bg-warning/12 px-4 py-3 text-sm font-medium text-warning">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-warning/20 text-xs font-semibold" aria-hidden="true">2</span>
                  {c.agent.request}
                </li>
                <li className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground" aria-hidden="true">3</span>
                  <span className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground">{c.agent.approve}</span>
                  <span className="rounded-full border bg-card px-3 py-1 font-medium">{c.agent.reject}</span>
                </li>
              </ol>
            </div>
          </section>
        </div>
      </section>

      <section aria-labelledby="closing-title" className={`${wrap}`}>
        <div className="grid justify-items-start gap-5 rounded-2xl bg-accent px-6 py-8 sm:px-10 sm:py-10">
          <h2 id="closing-title" className="max-w-2xl text-2xl font-semibold not-italic sm:text-3xl">{c.closing}</h2>
          <p className="max-w-xl text-accent-foreground/80">{c.closingSub}</p>
          <Controls items={c.control} label={c.controlTitle} />
          {cta('lg')}
        </div>
      </section>
    </main>
    <footer className={`${wrap} flex flex-wrap items-center justify-between gap-3 border-t py-5 text-sm text-muted-foreground`}>
      <span>AI Job Search Agent Platform · {new Date().getFullYear()}</span>
    </footer>
  </div>;
}
