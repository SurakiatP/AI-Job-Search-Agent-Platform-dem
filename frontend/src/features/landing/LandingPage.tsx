import { Link } from 'react-router';
import { Laptop, KeyRound, ShieldCheck } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { Header } from '../../components/Header';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { landingCopy } from './copy';
import { LandingPreview } from './LandingPreview';

const privacyIcons = [Laptop, KeyRound, ShieldCheck];

export function LandingPage() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
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
        <ol className="grid gap-4 md:grid-cols-3">
          {c.steps.map((step, i) => <li key={step.title}><Card className="grid h-full min-w-0 gap-3 p-6">
            <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden="true">{i + 1}</span>
            <h3 className="font-semibold not-italic">{step.title}</h3>
            <p className="text-sm text-muted-foreground">{step.body}</p>
          </Card></li>)}
        </ol>
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
