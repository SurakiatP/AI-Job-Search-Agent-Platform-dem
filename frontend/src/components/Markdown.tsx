import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { safeHttpUrl } from '../features/projects/useResource';

const components: Components = {
  h1: ({ node: _n, ...props }) => <h1 className="mb-3 mt-5 break-words text-xl font-semibold first:mt-0" {...props} />,
  h2: ({ node: _n, ...props }) => <h2 className="mb-2 mt-5 break-words text-lg font-semibold first:mt-0" {...props} />,
  h3: ({ node: _n, ...props }) => <h3 className="mb-2 mt-4 break-words text-base font-semibold first:mt-0" {...props} />,
  h4: ({ node: _n, ...props }) => <h4 className="mb-2 mt-4 break-words text-base font-semibold first:mt-0" {...props} />,
  h5: ({ node: _n, ...props }) => <h5 className="mb-2 mt-4 break-words text-sm font-semibold first:mt-0" {...props} />,
  h6: ({ node: _n, ...props }) => <h6 className="mb-2 mt-4 break-words text-sm font-semibold first:mt-0" {...props} />,
  p: ({ node: _n, ...props }) => <p className="my-3 whitespace-pre-line break-words first:mt-0 last:mb-0" {...props} />,
  ul: ({ node: _n, ...props }) => <ul className="my-3 list-disc space-y-1 pl-6" {...props} />,
  ol: ({ node: _n, ...props }) => <ol className="my-3 list-decimal space-y-1 pl-6" {...props} />,
  li: ({ node: _n, ...props }) => <li className="break-words" {...props} />,
  hr: ({ node: _n }) => <hr className="my-5 border-0 border-t border-border" />,
  blockquote: ({ node: _n, ...props }) => <blockquote className="my-3 border-l-2 border-border pl-4 text-muted-foreground" {...props} />,
  a: ({ node: _n, href, children }) => {
    const safe = safeHttpUrl(href);
    return safe ? <a href={safe} target="_blank" rel="noreferrer" className="break-words text-primary underline underline-offset-2">{children}</a> : <>{children}</>;
  },
  code: ({ node: _n, className, ...props }) => <code className={cn('break-words rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]', className)} {...props} />,
  pre: ({ node: _n, ...props }) => <pre className="my-3 max-w-full overflow-x-auto rounded-md bg-muted p-3 text-sm [&_code]:bg-transparent [&_code]:p-0" {...props} />,
  table: ({ node: _n, ...props }) => <div className="my-3 max-w-full overflow-x-auto"><table className="w-full border-collapse text-sm" {...props} /></div>,
  th: ({ node: _n, ...props }) => <th className="border border-border bg-muted px-3 py-2 text-left font-semibold" {...props} />,
  td: ({ node: _n, ...props }) => <td className="border border-border px-3 py-2 align-top" {...props} />,
};

export function Markdown({ children, className, ...props }: { children: string; className?: string; 'data-testid'?: string }) {
  return <div className={cn('min-w-0 break-words leading-relaxed', className)} {...props}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={['img']}>{children}</ReactMarkdown>
  </div>;
}
