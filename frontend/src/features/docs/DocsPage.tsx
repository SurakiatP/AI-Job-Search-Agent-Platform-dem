import { ArrowRight, Bell, FilePenLine, ClipboardList, MessagesSquare, FileText, FileUser, Rocket, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Header } from '../../components/Header';
import { LandingMenu, LandingNav } from '../landing/LandingNav';
import { Button } from '../../components/ui/button';
import { landingCopy } from '../landing/copy';
import { docsCopy } from './copy';
import { topics } from './topics';

const icons = [Rocket, FileUser, FilePenLine, Search, FileText, MessagesSquare, ClipboardList, Bell, ShieldCheck];

export function DocsPage() {
  const { locale } = useLocale();
  const c = docsCopy[locale];
  const how = landingCopy[locale].how;
  const status = useOwnerSession().status;
  return <div className="min-h-svh text-foreground">
    <Header menu={<LandingMenu signedOut={status !== 'ready' && status !== 'loading'} />} nav={<LandingNav />} actions={<>
      <Button asChild size="sm" variant="ghost"><Link to="/">{c.home}</Link></Button>
      {status === 'ready'
        ? <Button asChild size="sm"><Link to="/app/projects">{c.openApp}</Link></Button>
        : status !== 'loading' && <Button asChild size="sm"><Link to="/signup">{c.start}</Link></Button>}
    </>} />
    <main className="mx-auto grid w-full max-w-5xl gap-12 px-4 py-10 sm:px-6 sm:py-14">
      <section className="grid max-w-2xl gap-4">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground"><Sparkles className="size-6" /></span>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{c.title}</h1>
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{c.intro}</p>
      </section>

      <section aria-labelledby="quick-title" className="grid gap-4">
        <h2 id="quick-title" className="text-xl font-semibold">{c.quick}</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {how.map((step, index) => <li key={step.title} className="grid content-start gap-2 rounded-xl border bg-card p-5">
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{index + 1}</span>
            <h3 className="text-base font-semibold leading-snug">{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>)}
        </ol>
      </section>

      <section aria-labelledby="topics-title" className="grid gap-4">
        <h2 id="topics-title" className="text-xl font-semibold">{c.topics}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {c.list.map((topic, index) => {
            const Icon = icons[index];
            return <li key={topic.title}>
              <Link to={`/docs/${topics[index].id}`} className="group grid h-full content-start text-foreground gap-3 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/40">
                <span aria-hidden="true" className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-5" /></span>
                <h3 className="text-base font-semibold leading-snug [overflow-wrap:anywhere]">{topic.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{topic.body}</p>
                <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary">{c.read}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
              </Link>
            </li>;
          })}
        </ul>
      </section>
    </main>
  </div>;
}
