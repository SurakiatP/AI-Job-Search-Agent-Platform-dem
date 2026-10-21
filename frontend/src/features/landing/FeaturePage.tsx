import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Tick } from './Reveal';
import { Link, Navigate, useParams } from 'react-router';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Header } from '../../components/Header';
import { Button } from '../../components/ui/button';
import { landingCopy } from './copy';
import { featurePages, featureSlugs, type FeatureSlug } from './featurePages';
import { LandingMenu, LandingNav } from './LandingNav';
import { StepPanel } from './LandingPreview';

const ui = {
  th: { how: 'ทำงานอย่างไร', good: 'ควรรู้', sample: 'ตัวอย่างประกอบ', docs: 'ดูคู่มือ', others: 'ฟีเจอร์อื่น', prev: 'ก่อนหน้า', next: 'ถัดไป' },
  en: { how: 'How it works', good: 'Good to know', sample: 'Illustrative sample', docs: 'Read the guide', others: 'More features', prev: 'Previous', next: 'Next' },
};

/** One public page per feature: what it does, how it works step by step, and what to know. Text lives in featurePages.ts. */
export function FeaturePage() {
  const { slug } = useParams();
  const { locale } = useLocale();
  const status = useOwnerSession().status;
  const index = featureSlugs.indexOf(slug as FeatureSlug);
  if (index < 0) return <Navigate to="/" replace />;
  const c = landingCopy[locale], u = ui[locale], page = featurePages[locale][featureSlugs[index]];
  const prev = featureSlugs[index - 1], next = featureSlugs[index + 1];
  const cta = status === 'ready'
    ? <Button asChild size="lg"><Link to="/app/projects">{c.openApp}</Link></Button>
    : status !== 'loading' && <Button asChild size="lg"><Link to="/signup">{c.cta}</Link></Button>;
  return <div className="min-h-svh text-foreground">
    <Header menu={<LandingMenu signedOut={status !== 'ready' && status !== 'loading'} />} nav={<LandingNav />} actions={<>
      {status !== 'ready' && status !== 'loading' && <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex"><Link to="/login">{c.login}</Link></Button>}
      {status === 'ready' ? <Button asChild size="sm"><Link to="/app/projects">{c.openApp}</Link></Button> : status !== 'loading' && <Button asChild size="sm"><Link to="/signup">{c.signup}</Link></Button>}
    </>} />
    <main className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-8 sm:px-6 sm:py-12">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground hover:underline">{locale === 'th' ? 'หน้าแรก' : 'Home'}</Link><span aria-hidden="true">/</span>
        <span>{c.nav.features}</span><span aria-hidden="true">/</span><span aria-current="page" className="font-medium text-foreground">{c.steps[index].tab}</span>
      </nav>

      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12">
        <div className="grid content-start gap-4">
          <h1 className="text-3xl font-semibold leading-tight [text-wrap:balance] sm:text-4xl">{page.title}</h1>
          <p className="max-w-prose text-base leading-relaxed text-muted-foreground sm:text-lg">{page.lead}</p>
          <div className="flex flex-wrap gap-3 pt-1">{cta}<Button asChild size="lg" variant="outline"><Link to="/docs">{u.docs}</Link></Button></div>
        </div>
        <div className="grid min-w-0 gap-2">
          <StepPanel index={index} />
          <p className="text-xs text-muted-foreground">{u.sample}</p>
        </div>
      </section>

      <section aria-labelledby="how-title" className="grid gap-4">
        <h2 id="how-title" className="text-2xl font-semibold">{u.how}</h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {page.steps.map((step, i) => <li key={step.title} className="grid grid-cols-[2rem_minmax(0,1fr)] content-start gap-x-3 gap-y-1 rounded-xl border bg-card p-5">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{i + 1}</span>
            <h3 className="self-center text-base font-semibold leading-snug">{step.title}</h3>
            <p className="col-start-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>)}
        </ol>
      </section>

      <section aria-labelledby="good-title" className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <h2 id="good-title" className="text-lg font-semibold">{u.good}</h2>
        <ul className="grid gap-2 text-sm">
          {page.good.map(text => <li key={text} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /><span>{text}</span></li>)}
        </ul>
        <p className="flex items-start gap-2.5 border-t pt-4 text-sm text-muted-foreground"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Tick className="size-3" /></span><span>{page.note}</span></p>
      </section>

      <section aria-labelledby="more-title" className="grid gap-4">
        <h2 id="more-title" className="text-lg font-semibold">{u.others}</h2>
        <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {featureSlugs.map((s, i) => <li key={s}><Link to={`/features/${s}`} aria-current={i === index ? 'page' : undefined} className="block min-h-11 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent aria-[current=page]:border-primary aria-[current=page]:bg-accent">{c.steps[i].tab}</Link></li>)}
        </ul>
        <div className="flex flex-wrap justify-between gap-3">
          {prev ? <Button asChild variant="ghost"><Link to={`/features/${prev}`}><ArrowLeft className="size-4" aria-hidden="true" />{u.prev}: {c.steps[index - 1].tab}</Link></Button> : <span />}
          {next ? <Button asChild variant="ghost"><Link to={`/features/${next}`}>{u.next}: {c.steps[index + 1].tab}<ArrowRight className="size-4" aria-hidden="true" /></Link></Button> : <span />}
        </div>
      </section>
    </main>
  </div>;
}
