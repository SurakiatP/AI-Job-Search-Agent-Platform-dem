import { ArrowLeft, ArrowRight, Check, Lightbulb } from 'lucide-react';
import { useSeen } from './Reveal';
import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { landingCopy } from './copy';
import { featurePages, featureSlugs, type FeatureSlug } from './featurePages';
import { PublicHeader } from './LandingNav';
import { StepPanel } from './LandingPreview';

const ui = {
  th: { how: 'ทำงานอย่างไร', good: 'ควรรู้', sample: 'ตัวอย่างประกอบ', docs: 'ดูวิธีใช้ในคู่มือ', pager: 'ฟีเจอร์ก่อนหน้าและถัดไป', prev: 'ก่อนหน้า', next: 'ถัดไป' },
  en: { how: 'How it works', good: 'Good to know', sample: 'Illustrative sample', docs: 'See how in the manual', pager: 'Previous and next feature', prev: 'Previous', next: 'Next' },
};
// The manual topic that shows each feature step by step; connecting an assistant has no topic of its own yet.
const manualTopic: Record<FeatureSlug, string> = { 'add-cv': 'cv-and-experience', 'build-cv': 'build-cv', search: 'search-and-evaluate', evaluate: 'search-and-evaluate', practice: 'interview-practice', draft: 'tailor-and-draft', track: 'track-applications', alerts: 'job-alerts', connect: '' };

/** Fades and lifts its child in once it scrolls into view (stagger via `i`); no motion with reduced-motion. */
export function Rise({ i = 0, className = '', children }: { i?: number; className?: string; children: ReactNode }) {
  const [ref, seen] = useSeen<HTMLDivElement>(0.15);
  return <div ref={ref} style={{ transitionDelay: seen ? `${Math.min(i, 5) * 60}ms` : undefined }} className={`${className} motion-safe:transition-[opacity,translate] motion-safe:duration-500 motion-safe:ease-[var(--ease-out)] ${seen ? '' : 'motion-safe:translate-y-4 motion-safe:opacity-0'}`}>{children}</div>;
}

const stepSpan = ['lg:col-span-4', 'lg:col-span-2', 'lg:col-span-2', 'lg:col-span-4', 'lg:col-span-6'];

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
    <PublicHeader />
    <main className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-8 sm:px-6 sm:py-12">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="inline-flex min-h-11 items-center hover:text-foreground hover:underline lg:min-h-10">{locale === 'th' ? 'หน้าแรก' : 'Home'}</Link><span aria-hidden="true">/</span>
        <span>{c.nav.features}</span><span aria-hidden="true">/</span><span aria-current="page" className="font-medium text-foreground">{c.steps[index].tab}</span>
      </nav>

      <section className="ambient-surface relative grid items-center gap-8 rounded-3xl border bg-card/60 p-4 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12 lg:p-12">
        <div className="grid content-start gap-4">
          <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight [text-wrap:balance] sm:text-5xl">{page.title}</h1>
          <p className="max-w-prose text-base leading-relaxed text-muted-foreground sm:text-lg">{page.lead}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">{cta}<Link to={manualTopic[featureSlugs[index]] ? `/docs/${manualTopic[featureSlugs[index]]}` : '/docs'} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline lg:min-h-10">{u.docs}<ArrowRight className="size-4" aria-hidden="true" /></Link></div>
        </div>
        <div className="grid min-w-0 gap-2">
          <div className="gem-border min-w-0 overflow-hidden rounded-3xl shadow-[var(--shadow-lift)] motion-safe:lg:-rotate-1"><StepPanel index={index} /></div>
          <p className="text-center text-xs text-muted-foreground">{u.sample}</p>
        </div>
      </section>

      <section aria-labelledby="how-title" className="grid gap-6">
        <h2 id="how-title" className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{u.how}</h2>
        <ol className="grid gap-4 lg:grid-cols-6">
          {page.steps.map((step, i) => <li key={step.title} className={`grid ${stepSpan[i % stepSpan.length]}`}>
            <Rise i={i} className="group grid h-full grid-cols-[3rem_minmax(0,1fr)] content-start gap-x-3 gap-y-2 rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)] transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:p-6">
              <span aria-hidden="true" className="font-heading text-5xl font-semibold leading-none text-primary">{i + 1}</span>
              <h3 className="min-w-0 self-center break-words text-lg font-semibold leading-snug">{step.title}</h3>
              <p className="col-start-2 min-w-0 max-w-prose break-words text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </Rise>
          </li>)}
        </ol>
      </section>

      <section aria-labelledby="good-title" className="grid gap-6">
        <h2 id="good-title" className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{u.good}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.good.map((text, i) => <li key={text} className="grid"><Rise i={i} className="flex h-full items-start gap-3 rounded-2xl border bg-card p-5 text-sm shadow-[var(--shadow-soft)]">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent text-success"><Check className="size-4" aria-hidden="true" /></span><span className="min-w-0 break-words pt-1 leading-relaxed">{text}</span>
          </Rise></li>)}
          <li className="grid sm:col-span-2 lg:col-span-1"><Rise i={page.good.length} className="gem-border flex h-full items-start gap-3 rounded-2xl p-5 text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Lightbulb className="size-4" aria-hidden="true" /></span><span className="min-w-0 break-words pt-1 leading-relaxed">{page.note}</span>
          </Rise></li>
        </ul>
      </section>

      <nav aria-label={u.pager} className="grid gap-4 sm:grid-cols-2">
        {prev ? <Link to={`/features/${prev}`} className="group flex min-h-16 items-center gap-3 rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)] transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"><ArrowLeft className="size-5 shrink-0 text-primary" aria-hidden="true" /><span className="font-medium">{u.prev}: {c.steps[index - 1].tab}</span></Link> : <span />}
        {next ? <Link to={`/features/${next}`} className="group flex min-h-16 items-center justify-end gap-3 rounded-2xl border bg-card p-4 text-right shadow-[var(--shadow-soft)] transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:col-start-2"><span className="font-medium">{u.next}: {c.steps[index + 1].tab}</span><ArrowRight className="size-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></Link> : <span />}
      </nav>
    </main>
  </div>;
}
