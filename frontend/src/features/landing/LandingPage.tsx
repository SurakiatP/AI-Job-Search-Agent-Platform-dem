import { Link } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { Header } from '../../components/Header';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { landingCopy } from './copy';
import { AgentMini, HeroCards, LocalMini } from './LandingPreview';
import { Reveal } from './Reveal';
import { Tour } from './Tour';
import './landing.css';

const wrap = 'mx-auto w-full max-w-6xl px-4 sm:px-6';

export function LandingPage() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  return <div className="landing text-foreground">
    <Header actions={<Button asChild size="sm"><Link to="/app">{c.cta}</Link></Button>} />
    <main className="grid gap-24 pb-16 lg:gap-32">
      <section className="relative">
        <div className="landing-hero-bg" aria-hidden="true" />
        <div className={`${wrap} relative py-16 text-center lg:py-32`}>
          <HeroCards />
          <div className="mx-auto grid max-w-xl justify-items-center gap-6 xl:max-w-2xl">
            <h1 className="text-4xl font-semibold leading-[1.35] not-italic [text-wrap:balance] sm:text-5xl lg:text-4xl xl:text-5xl">
              <span className="block">{c.headlineA}</span><span className="landing-gradient-text">{c.headlineB}</span>
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">{c.sub}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild size="lg"><Link to="/app">{c.cta}</Link></Button>
              <Button asChild size="lg" variant="outline"><a href="#how">{c.secondary}</a></Button>
            </div>
          </div>
          <p className="mt-12 hidden text-xs text-muted-foreground lg:block">{c.caption}</p>
        </div>
      </section>

      <Reveal className={wrap}>
        <p className="mx-auto max-w-4xl text-3xl font-semibold leading-[1.5] not-italic sm:text-4xl lg:text-5xl lg:leading-[1.5]">
          <span className="landing-fade text-muted-foreground">{c.statement.muted}</span>{' '}
          <span className="landing-fade text-primary" style={{ ['--d' as string]: '350ms' }}>{c.statement.accent}</span>
        </p>
      </Reveal>

      <Tour />

      <section className={`${wrap} grid gap-10`} aria-labelledby="diff-title">
        <h2 id="diff-title" className="text-center text-3xl font-semibold not-italic">{c.diffTitle}</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {([[c.local, <LocalMini key="l" />], [c.agent, <AgentMini key="a" />]] as const).map(([d, mini], i) => <Reveal key={d.title} className="landing-rise" style={{ ['--d' as string]: `${i * 120}ms` }}>
            <Card className="grid h-full min-w-0 content-start gap-5 p-6 sm:p-8">
              <h3 className="text-2xl font-semibold not-italic">{d.title}</h3>
              <p className="text-muted-foreground">{d.body}</p>
              {mini}
            </Card>
          </Reveal>)}
        </div>
      </section>

      <Reveal className={`${wrap} landing-rise`}>
        <ul className="grid gap-6 sm:grid-cols-3">
          {c.facts.map(f => <li key={f.label} className="grid gap-1 text-center">
            <span className="landing-gradient-text text-5xl font-semibold tabular-nums">{f.value}</span>
            <span className="text-sm text-muted-foreground">{f.label}</span>
          </li>)}
        </ul>
      </Reveal>

      <section className={wrap}>
        <Reveal className="landing-rise">
          <div className="landing-cta-bg grid justify-items-center gap-6 rounded-3xl border px-6 py-16 text-center">
            <h2 className="max-w-2xl text-3xl font-semibold not-italic sm:text-4xl">{c.closing}</h2>
            <Button asChild size="lg"><Link to="/app">{c.cta}</Link></Button>
          </div>
        </Reveal>
      </section>
    </main>
    <footer className={`${wrap} flex flex-wrap items-center justify-between gap-3 pb-8 text-sm text-muted-foreground`}>
      <span>AI Job Search Agent Platform · {new Date().getFullYear()}</span>
      <a className="inline-flex items-center gap-1 rounded-md hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="https://freehire.me" target="_blank" rel="noreferrer">{c.credit}<ExternalLink aria-hidden="true" size={14} /></a>
    </footer>
  </div>;
}
