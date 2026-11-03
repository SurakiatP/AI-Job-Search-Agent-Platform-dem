import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
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

      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12">
        <div className="grid content-start gap-4">
          <h1 className="text-3xl font-semibold [text-wrap:balance] sm:text-4xl">{page.title}</h1>
          <p className="max-w-prose text-base leading-relaxed text-muted-foreground sm:text-lg">{page.lead}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">{cta}<Link to={manualTopic[featureSlugs[index]] ? `/docs/${manualTopic[featureSlugs[index]]}` : '/docs'} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline lg:min-h-10">{u.docs}<ArrowRight className="size-4" aria-hidden="true" /></Link></div>
        </div>
        <div className="grid min-w-0 gap-2">
          <StepPanel index={index} />
          <p className="text-xs text-muted-foreground">{u.sample}</p>
        </div>
      </section>

      <section aria-labelledby="how-title" className="grid gap-4">
        <h2 id="how-title" className="text-2xl font-semibold">{u.how}</h2>
        <ol className="grid divide-y rounded-xl border bg-card">
          {page.steps.map((step, i) => <li key={step.title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:px-6">
            <span aria-hidden="true" className="font-heading text-2xl leading-none text-primary">{i + 1}</span>
            <h3 className="text-base font-semibold leading-snug">{step.title}</h3>
            <p className="col-start-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>)}
        </ol>
      </section>

      <section aria-labelledby="good-title" className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <h2 id="good-title" className="text-lg font-semibold">{u.good}</h2>
        <ul className="grid gap-2 text-sm">
          {page.good.map(text => <li key={text} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /><span>{text}</span></li>)}
        </ul>
        <p className="border-t pt-4 text-sm text-muted-foreground">{page.note}</p>
      </section>

      <nav aria-label={u.pager} className="flex flex-wrap justify-between gap-3 border-t pt-6">
          {prev ? <Button asChild variant="ghost"><Link to={`/features/${prev}`}><ArrowLeft className="size-4" aria-hidden="true" />{u.prev}: {c.steps[index - 1].tab}</Link></Button> : <span />}
          {next ? <Button asChild variant="ghost"><Link to={`/features/${next}`}>{u.next}: {c.steps[index + 1].tab}<ArrowRight className="size-4" aria-hidden="true" /></Link></Button> : <span />}
      </nav>
    </main>
  </div>;
}
