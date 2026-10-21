import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useParams } from 'react-router';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Header } from '../../components/Header';
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
  const [page, setPage] = useState<{ title: string; body: string } | null | undefined>(undefined);
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
    <Header actions={<>
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
              <span className="tabular-nums text-xs opacity-70">{position + 1}</span><span>{c.list[position].title}</span>
            </Link>
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
          <div className="manual-body"><Markdown remarkPlugins={[remarkGfm]} components={{
            img: ({ src, alt }) => src?.endsWith('.mp4')
              ? <video src={src} controls muted playsInline preload="metadata" aria-label={alt} />
              : <img src={src} alt={alt ?? ''} loading="lazy" />,
            a: ({ href, children }) => href?.startsWith('/') ? <Link to={href}>{children}</Link> : <a href={href}>{children}</a>,
          }}>{page.body}</Markdown></div>
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
