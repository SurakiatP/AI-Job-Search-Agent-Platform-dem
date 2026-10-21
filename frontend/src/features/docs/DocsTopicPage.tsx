import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useParams } from 'react-router';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Header } from '../../components/Header';
import { LandingMenu, LandingNav } from '../landing/LandingNav';
import { Button } from '../../components/ui/button';
import { loadPage, prepare, topics } from './topics';
import { docsCopy } from './copy';

export function DocsTopicPage() {
  const { topic: slug } = useParams();
  const { locale } = useLocale();
  const c = docsCopy[locale];
  const status = useOwnerSession().status;
  const index = topics.findIndex(item => item.id === slug);
  const topic = topics[index];
  const titleOf = (id: string) => c.list[topics.findIndex(item => item.id === id)].title;
  const [page, setPage] = useState<ReturnType<typeof prepare> | null | undefined>(undefined);
  useEffect(() => {
    setPage(undefined);
    const raw = topic ? loadPage(topic.file, locale) : undefined;
    if (!raw) { setPage(null); return; }
    let live = true;
    raw.then(text => live && setPage(prepare(text, titleOf)), () => live && setPage(null));
    return () => { live = false; };
  }, [topic, locale]);
  const previous = topics[index - 1], next = topics[index + 1];

  return <div className="min-h-svh text-foreground">
    <Header menu={<LandingMenu signedOut={status !== 'ready' && status !== 'loading'} />} nav={<LandingNav />} actions={<>
      <Button asChild size="sm" variant="ghost"><Link to="/docs">{c.back}</Link></Button>
      {status === 'ready' && <Button asChild size="sm"><Link to="/app/projects">{c.openApp}</Link></Button>}
    </>} />
    <main data-stage={topic?.stage}>
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
      <nav aria-label={c.topics} className="mb-8 lg:sticky lg:top-20 lg:mb-0 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-2 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0">
          {topics.map((item, position) => <li key={item.id} className="shrink-0">
            <Link to={`/docs/${item.id}`} aria-current={item.id === slug ? 'page' : undefined}
              className="flex items-baseline gap-2 rounded-lg px-3 py-2 text-sm leading-snug text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent-foreground">
              <span className="tabular-nums text-xs opacity-70">{position + 1}</span><span className="flex-1">{c.list[position].title}</span>
              {item.id === slug && page && <ChevronDown className="hidden size-4 shrink-0 self-center lg:block" aria-hidden="true" />}
            </Link>
            {item.id === slug && page && <nav aria-label={c.onThisPage} className="ml-[1.35rem] mt-1 hidden border-l-2 border-[var(--stage,var(--primary))]/30 pl-2 lg:block">
              <ul className="grid gap-0.5">
                {page.sections.map((section, sectionIndex) => <li key={section.heading}>
                  <a href={`#section-${sectionIndex + 1}`} className="block rounded-md px-3 py-1.5 text-sm leading-snug text-muted-foreground hover:bg-accent hover:text-accent-foreground">{section.heading}</a>
                </li>)}
              </ul>
            </nav>}
          </li>)}
        </ol>
      </nav>

      <article className="min-w-0">
        {page === undefined && <p className="text-muted-foreground">{c.loading}</p>}
        {page === null && <div className="grid gap-4">
          <h1 className="text-3xl font-semibold leading-tight">{c.notFound}</h1>
          <Link to="/docs" className="text-primary underline underline-offset-4">{c.backToGuide}</Link>
        </div>}
        {page && topic && <>
          <p className="mb-2 text-sm font-medium text-[var(--stage,var(--primary))]">{c.topicOf(index + 1, topics.length)}</p>
          <h1 className="mb-8 text-3xl font-semibold leading-tight sm:text-4xl">{page.title}</h1>
          <nav aria-label={c.onThisPage} className="mb-8 flex flex-wrap gap-2 lg:hidden">
            {page.sections.map((section, position) => <a key={section.heading} href={`#section-${position + 1}`}
              className="rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">{section.heading}</a>)}
          </nav>
          <div className="manual-body">
            {page.sections.map((section, position) => {
              const note = /ข้อควรทราบ|good to know/i.test(section.heading);
              const Wrapper = 'section';
              return <Wrapper key={section.heading} id={`section-${position + 1}`} data-callout={note ? 'note' : undefined} className="scroll-mt-24">
                <h2>{section.heading}</h2>
                <Markdown remarkPlugins={[remarkGfm]} components={{
                  p: ({ node, children }) => {
                    const media = node?.children.length === 1 && node.children[0].type === 'element' && ['img', 'video'].includes(node.children[0].tagName);
                    if (!media) return <p>{children}</p>;
                    const alt = String((node!.children[0] as { properties?: { alt?: string } }).properties?.alt ?? '');
                    return <figure>{children}<figcaption>{alt} · {c.madeUp}</figcaption></figure>;
                  },
                  img: ({ src, alt }) => src?.endsWith('.mp4')
                    ? <video src={src} poster={src.replace(/\.mp4$/, '.poster.png')} controls muted playsInline preload="metadata" aria-label={alt} />
                    : <img src={src} alt={alt ?? ''} loading="lazy" />,
                  a: ({ href, children }) => href?.startsWith('/') ? <Link to={href}>{children}</Link> : <a href={href}>{children}</a>,
                }}>{section.body}</Markdown>
              </Wrapper>;
            })}
          </div>
          <nav aria-label={c.pager} className="mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2">
            {previous ? <Link to={`/docs/${previous.id}`} className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm font-medium hover:bg-accent"><ArrowLeft className="size-4 shrink-0" aria-hidden="true" />{titleOf(previous.id)}</Link> : <span />}
            {next && <Link to={`/docs/${next.id}`} className="flex items-center justify-end gap-2 rounded-lg border bg-card p-4 text-right text-sm font-medium hover:bg-accent sm:col-start-2">{titleOf(next.id)}<ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Link>}
          </nav>
        </>}
      </article>
    </div>
    </main>
  </div>;
}
