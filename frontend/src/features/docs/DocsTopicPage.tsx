import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useParams } from 'react-router';
import { useLocale } from '../../app/providers';
import { PublicHeader } from '../landing/LandingNav';
import { loadPage, prepare, topics } from './topics';
import { docsCopy } from './copy';

export function DocsTopicPage() {
  const { topic: slug } = useParams();
  const [open, setOpen] = useState(true);
  useEffect(() => setOpen(true), [slug]);
  const { locale } = useLocale();
  const c = docsCopy[locale];
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
    <PublicHeader />
    <main data-stage={topic?.stage}>
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-12 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
      <nav aria-label={c.topics} className="mb-8 lg:sticky lg:top-20 lg:mb-0 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-2 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0">
          {topics.map((item, position) => <li key={item.id} className="shrink-0">
            <div className="flex items-center rounded-lg aria-[current=page]:bg-accent" aria-current={item.id === slug ? 'page' : undefined}>
              <Link to={`/docs/${item.id}`} aria-current={item.id === slug ? 'page' : undefined}
                className="flex min-h-11 flex-1 items-baseline gap-2 rounded-lg px-3 py-2 text-sm leading-snug text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-[current=page]:font-semibold aria-[current=page]:text-accent-foreground lg:min-h-10">
                <span className="tabular-nums text-xs opacity-70">{position + 1}</span><span className="flex-1">{c.list[position].title}</span>
              </Link>
              {item.id === slug && page && <button type="button" aria-expanded={open} aria-controls="docs-sections" aria-label={`${c.onThisPage}: ${open ? c.collapse : c.expand}`} onClick={() => setOpen(value => !value)}
                className="me-1 hidden size-10 shrink-0 items-center justify-center rounded-full text-accent-foreground hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex">
                <ChevronDown className={`size-5 transition-transform duration-500 ease-[var(--ease-standard)] ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
              </button>}
            </div>
            {item.id === slug && page && <div id="docs-sections" className={`docs-sections hidden lg:grid ${open ? 'is-open' : ''}`}>
              <nav aria-label={c.onThisPage} inert={!open} className="ml-5 mt-1 min-h-0 overflow-hidden border-l-2 border-[var(--stage,var(--primary))]/30 pl-2">
                <ul className="grid gap-0.5">
                  {page.sections.map((section, sectionIndex) => <li key={section.heading}>
                    <a href={`#section-${sectionIndex + 1}`} className="block rounded-md px-3 py-2 text-sm leading-snug text-muted-foreground hover:bg-accent hover:text-accent-foreground">{section.heading}</a>
                  </li>)}
                </ul>
              </nav>
            </div>}
          </li>)}
        </ol>
      </nav>

      <article className="min-w-0">
        {page === undefined && <p className="text-muted-foreground">{c.loading}</p>}
        {page === null && <div className="grid gap-4">
          <h1 className="text-3xl font-semibold">{c.notFound}</h1>
          <Link to="/docs" className="text-primary underline underline-offset-4">{c.backToGuide}</Link>
        </div>}
        {page && topic && <>
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Link to="/docs" className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline lg:min-h-10">{c.title}</Link><span aria-hidden="true">/</span><span>{c.topicOf(index + 1, topics.length)}</span></p>
          <h1 className="mb-8 text-3xl font-semibold sm:text-4xl">{page.title}</h1>
          <nav aria-label={c.onThisPage} className="mb-8 flex flex-wrap gap-2 lg:hidden">
            {page.sections.map((section, position) => <a key={section.heading} href={`#section-${position + 1}`}
              className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">{section.heading}</a>)}
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
          <nav aria-label={c.pager} className="mt-12 grid gap-3 border-t pt-6 sm:grid-cols-2">
            {previous ? <Link to={`/docs/${previous.id}`} className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm font-medium hover:bg-accent"><ArrowLeft className="size-4 shrink-0" aria-hidden="true" />{titleOf(previous.id)}</Link> : <span />}
            {next && <Link to={`/docs/${next.id}`} className="flex items-center justify-end gap-2 rounded-lg border bg-card p-4 text-right text-sm font-medium hover:bg-accent sm:col-start-2">{titleOf(next.id)}<ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Link>}
          </nav>
        </>}
      </article>
    </div>
    </main>
  </div>;
}
