import { Link } from 'react-router';
import { AlertTriangle, Bot, ExternalLink, Globe, KeyRound, Laptop, Plug, ShieldCheck } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { Header } from '../../components/Header';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { landingCopy, previewCopy } from './copy';
import { LandingPreview } from './LandingPreview';

const privacyIcons = [Laptop, KeyRound, ShieldCheck];
const doorIcons = [Globe, Plug, Bot];

export function LandingPage() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  const p = previewCopy[locale];
  return <>
    <Header actions={<Button asChild size="sm"><Link to="/app">{c.cta}</Link></Button>} />
    <main className="mx-auto grid w-full max-w-6xl gap-16 px-4 py-10 sm:px-6 lg:py-16">
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="grid min-w-0 gap-6">
          <h1 className="font-serif text-4xl font-medium leading-[1.4] not-italic lg:text-5xl [overflow-wrap:anywhere]">{c.headline}</h1>
          <p className="text-lg text-muted-foreground">{c.sub}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to="/app">{c.cta}</Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#how">{c.secondary}</a></Button>
          </div>
        </div>
        <LandingPreview />
      </section>
      <section id="how" className="grid scroll-mt-20 gap-6" aria-labelledby="how-title">
        <h2 id="how-title" className="text-2xl font-semibold not-italic">{c.howTitle}</h2>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {c.steps.map((step, i) => <li key={step.title}><Card className="grid h-full min-w-0 gap-3 p-6 [overflow-wrap:anywhere]">
            <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden="true">{i + 1}</span>
            <h3 className="font-semibold not-italic">{step.title}</h3>
            <p className="text-sm text-muted-foreground">{step.body}</p>
          </Card></li>)}
        </ol>
      </section>
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-labelledby="real-title">
        <div className="grid min-w-0 gap-4">
          <h2 id="real-title" className="text-2xl font-semibold not-italic [overflow-wrap:anywhere]">{c.realTitle}</h2>
          <p className="text-muted-foreground">{c.realBody}</p>
          <ul className="grid gap-2 pl-5 text-sm [overflow-wrap:anywhere]">{c.realPoints.map(t => <li className="list-disc" key={t}>{t}</li>)}</ul>
          <a className="inline-flex w-fit items-center gap-1 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="https://freehire.me" target="_blank" rel="noreferrer">{c.realCredit}<ExternalLink aria-hidden="true" size={14} /></a>
        </div>
        <Card className="grid min-w-0 gap-3 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3"><p className="min-w-0 text-sm font-medium text-muted-foreground">{c.realSampleLabel}</p><Badge variant="outline" className="shrink-0">ตัวอย่าง / Sample</Badge></div>
          <ul className="grid gap-3">{p.jobs.map(j => <li key={j.title} className="grid min-w-0 gap-2 rounded-xl border p-3">
            <span className="font-semibold leading-snug [overflow-wrap:anywhere]">{j.title}</span>
            <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{j.company} · {j.place}</span>
            <span className="flex flex-wrap gap-2">
              <Badge variant="outline">{j.age}</Badge>
              {j.stale && <Badge variant="warning" className="gap-1"><AlertTriangle className="size-3" aria-hidden="true" />{p.staleLabel}</Badge>}
            </span>
          </li>)}</ul>
        </Card>
      </section>
      <section className="grid gap-6" aria-labelledby="connect-title">
        <div className="grid gap-1">
          <h2 id="connect-title" className="text-2xl font-semibold not-italic [overflow-wrap:anywhere]">{c.connectTitle}</h2>
          <p className="text-muted-foreground">{c.connectLead}</p>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          {c.doors.map((d, i) => { const Icon = doorIcons[i]; return <li key={d.title}><Card className="grid h-full min-w-0 content-start gap-3 p-6">
            <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon aria-hidden="true" size={20} /></span>
            <h3 className="font-semibold not-italic [overflow-wrap:anywhere]">{d.title}</h3>
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{d.body}{i === 2 && <> <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs [overflow-wrap:anywhere]">/.well-known/agent-card.json</code></>}</p>
          </Card></li>; })}
        </ul>
        <ul className="grid gap-2 pl-5 text-sm [overflow-wrap:anywhere]">{c.connectPoints.map(t => <li className="list-disc" key={t}>{t}</li>)}</ul>
        <p className="text-sm text-muted-foreground">{c.connectNote}</p>
      </section>
      <section aria-labelledby="privacy-title">
        <Card className="grid gap-6 p-6 sm:p-8">
          <h2 id="privacy-title" className="text-2xl font-semibold not-italic">{c.privacyTitle}</h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {c.privacy.map((text, i) => { const Icon = privacyIcons[i]; return <li className="flex min-w-0 items-center gap-3" key={text}>
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon aria-hidden="true" size={20} /></span>
              <span className="min-w-0 font-medium">{text}</span>
            </li>; })}
          </ul>
          <p className="text-sm text-muted-foreground">{c.privacyNote}</p>
        </Card>
      </section>
      <section className="grid justify-items-center gap-5 rounded-xl bg-accent px-6 py-12 text-center text-accent-foreground">
        <h2 className="text-2xl font-semibold not-italic">{c.closing}</h2>
        <Button asChild size="lg"><Link to="/app">{c.cta}</Link></Button>
      </section>
    </main>
    <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-sm text-muted-foreground sm:px-6">AI Job Search Agent Platform · {new Date().getFullYear()}</footer>
  </>;
}
