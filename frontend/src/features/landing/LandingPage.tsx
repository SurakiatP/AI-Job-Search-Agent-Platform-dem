import { Link } from 'react-router';
import { Info } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Header } from '../../components/Header';
import { Button } from '../../components/ui/button';
import { landingCopy } from './copy';
import { DemoCard } from './LandingPreview';
import { Reveal } from './Reveal';
import { Tour } from './Tour';
import './landing.css';

const wrap = 'mx-auto w-full max-w-6xl px-4 sm:px-6';

export function LandingPage() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  // Signed-in visitors get one "Open app" button instead of sign-up / log-in; nothing shows until the session is known.
  const status = useOwnerSession().status;
  const cta = (size: 'sm' | 'lg') => status === 'ready'
    ? <Button asChild size={size}><Link to="/app/projects">{c.openApp}</Link></Button>
    : status === 'loading' ? null : <Button asChild size={size}><Link to="/signup">{size === 'sm' ? c.signup : c.cta}</Link></Button>;
  return <div className="landing text-foreground">
    <Header actions={<>
      {cta('sm')}
      {status !== 'ready' && status !== 'loading' && <Button asChild size="sm" variant="outline"><Link to="/login">{c.login}</Link></Button>}
    </>} />
    <main className="grid gap-16 pb-12 sm:gap-20 sm:pb-16">
      <section className={`${wrap} grid items-center gap-10 pt-10 sm:pt-14 lg:grid-cols-2 lg:gap-12 lg:pt-16`}>
        <div className="grid content-start justify-items-start gap-5">
          <h1 className="landing-headline max-w-2xl not-italic [text-wrap:balance]">
            <span className="block">{c.headlineA}</span><span>{c.headlineB}</span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">{c.sub}</p>
          <div className="flex flex-wrap items-center gap-3">
            {cta('lg')}
            <Button asChild size="lg" variant="outline"><a href="#steps">{c.secondary}</a></Button>
          </div>
        </div>
        <div className="min-w-0"><DemoCard /></div>
      </section>

      <section id="steps" aria-labelledby="steps-title" className={`${wrap} grid scroll-mt-16 gap-6`}>
        <h2 id="steps-title" className="text-2xl font-semibold not-italic sm:text-3xl">{c.stepsTitle}</h2>
        <Reveal className="landing-reveal">
          <ol className="grid gap-6 md:grid-cols-3 md:gap-0">
            {c.how.map((step, index) => <li key={step.title} className="grid grid-cols-[2rem_minmax(0,1fr)] content-start gap-x-3 gap-y-1 md:border-l md:px-6 md:first:border-l-0 md:first:pl-0">
              <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{index + 1}</span>
              <h3 className="self-center text-lg font-semibold leading-snug not-italic">{step.title}</h3>
              <p className="col-start-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{step.body}</p>
            </li>)}
          </ol>
        </Reveal>
        <p className="flex items-start gap-2 border-t pt-4 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{c.noSubmit}</span></p>
      </section>

      <Tour />

      <section className={`${wrap} grid gap-7`} aria-labelledby="diff-title">
        <h2 id="diff-title" className="text-2xl font-semibold not-italic sm:text-3xl">{c.diffTitle}</h2>
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <section className="grid content-start gap-4" aria-labelledby="local-title">
            <h3 id="local-title" className="text-xl font-semibold not-italic">{c.local.title}</h3>
            <p className="max-w-prose leading-relaxed text-muted-foreground">{c.local.body}</p>
            <ul className="grid gap-2 text-sm">
              {c.local.rows.map(row => <li key={row} className="border-t pt-2">{row}</li>)}
              <li className="border-t pt-2"><span className="font-medium">{c.local.submit}</span><span className="text-muted-foreground"> · {c.local.submitNote}</span></li>
            </ul>
          </section>
          <section className="grid content-start gap-4 border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8" aria-labelledby="agent-title">
            <h3 id="agent-title" className="text-xl font-semibold not-italic">{c.agent.title}</h3>
            <p className="max-w-prose leading-relaxed text-muted-foreground">{c.agent.body}</p>
            <ul className="grid gap-2 text-sm">
              <li className="border-t pt-2"><span className="font-medium">{c.agent.token}</span><span className="text-muted-foreground"> · {c.agent.scopes}</span></li>
              <li className="border-t pt-2">{c.agent.request}</li>
              <li className="border-t pt-2">{c.agent.approve} / {c.agent.reject}</li>
            </ul>
          </section>
        </div>
      </section>

      <section className={`${wrap} grid justify-items-start gap-5`}>
        <h2 className="max-w-2xl text-2xl font-semibold not-italic sm:text-3xl">{c.closing}</h2>
        {cta('lg')}
      </section>
    </main>
    <footer className={`${wrap} flex flex-wrap items-center justify-between gap-3 border-t py-5 text-sm text-muted-foreground`}>
      <span>AI Job Search Agent Platform · {new Date().getFullYear()}</span>
    </footer>
  </div>;
}
