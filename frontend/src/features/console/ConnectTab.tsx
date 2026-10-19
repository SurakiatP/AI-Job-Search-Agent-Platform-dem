import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAccount } from '../../lib/api';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import type { Copy } from './copy';
import { CopyButton } from './shared';

const START = 'uv run --locked --project backend python scripts/run_local.py --enable-sharing --share-host 127.0.0.1 --share-port 8011';
const TOKEN = '<ACCESS_TOKEN>';
type Info = { share_origin: string | null; oauth: boolean };

function Block({ text, c, label }: { text: string; c: Copy; label: string }) {
  return <div className="grid gap-2">
    <span className="text-sm font-medium">{label}</span>
    <pre className="overflow-x-auto rounded-lg border bg-muted p-3 text-xs" tabIndex={0} aria-label={label}><code>{text}</code></pre>
    <div><CopyButton text={text} c={c} label={label} /></div>
  </div>;
}

function Url({ label, url, c }: { label: string; url: string; c: Copy }) {
  return <div className="grid gap-1.5">
    <span className="text-sm font-medium">{label}</span>
    <div className="flex flex-wrap items-center gap-3"><code className="min-w-0 break-all rounded-md bg-muted px-2 py-1 text-sm">{url}</code><CopyButton text={url} c={c} label={label} /></div>
  </div>;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-3 text-base">
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm text-primary-foreground">{n}</span>{title}
  </CardTitle></CardHeader><CardContent className="grid gap-5">{children}</CardContent></Card>;
}

export function ConnectTab({ c, projectId, onIssue }: { c: Copy; projectId: string; onIssue: () => void }) {
  const isAdmin = useAccount()?.is_admin === true; // only whoever runs the server can open the listener
  const info = useResource<Info>('/connect');
  if (info.status === 'error') return <ErrorState onRetry={info.reload} />;
  if (!info.data) return <LoadingState />;
  const share = info.data.share_origin;
  const api = `${window.location.origin}/api/v1`;
  if (!share) return <div className="grid gap-6">
    <p className="max-w-prose text-sm text-muted-foreground">{c.connectIntro}</p>
    <p role="status" className="rounded-lg border border-warning p-3 text-sm">{isAdmin ? c.offAdmin : c.offUser}</p>
    {isAdmin && <Card><CardHeader><CardTitle>{c.startTitle}</CardTitle><p className="text-sm text-muted-foreground">{c.startNote}</p></CardHeader>
      <CardContent><Block text={START} c={c} label={c.startTitle} /></CardContent></Card>}
  </div>;
  const mcp = `${share}/mcp`;
  const json = JSON.stringify({ mcpServers: { 'job-search': { type: 'http', url: mcp, headers: { Authorization: `Bearer ${TOKEN}` } } } }, null, 2);
  const claude = `claude mcp add --transport http job-search ${mcp} --header "Authorization: Bearer ${TOKEN}"`;
  const rest = `curl -H "Authorization: Bearer ${TOKEN}" ${api}/projects/${projectId}/runs`;
  return <div className="grid gap-6">
    <p className="max-w-prose text-sm text-muted-foreground">{c.connectIntro}</p>
    <p role="status" className="text-sm font-medium text-success">{c.ready}</p>
    <Step n={1} title={c.step1}>
      <p className="max-w-prose text-sm text-muted-foreground">{c.step1Body}</p>
      {info.data.oauth && <p className="max-w-prose text-sm text-muted-foreground">{c.oauthNote}</p>}
      <div><Button type="button" onClick={onIssue}>{c.issue}</Button></div>
    </Step>
    <Step n={2} title={c.step2}>
      <section className="grid gap-4" aria-labelledby="connect-mcp"><h3 id="connect-mcp" className="font-semibold">MCP</h3>
        <p className="max-w-prose text-sm text-muted-foreground">{c.mcpBody}</p>
        <Url label={c.mcp} url={mcp} c={c} />
        <Block text={claude} c={c} label={c.claudeCmd} />
        <Block text={json} c={c} label={c.snippetTitle} />
      </section>
      <section className="grid gap-4 border-t pt-5" aria-labelledby="connect-a2a"><h3 id="connect-a2a" className="font-semibold">A2A</h3>
        <p className="max-w-prose text-sm text-muted-foreground">{c.a2aBody}</p>
        <Url label={c.card} url={`${share}/.well-known/agent-card.json`} c={c} />
        <Url label={c.a2a} url={share} c={c} />
      </section>
      <section className="grid gap-4 border-t pt-5" aria-labelledby="connect-rest"><h3 id="connect-rest" className="font-semibold">REST API</h3>
        <p className="max-w-prose text-sm text-muted-foreground">{c.restBody}</p>
        <Url label={c.restBase} url={api} c={c} />
        <Block text={rest} c={c} label={c.restExample} />
        <a className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/api/v1/docs" target="_blank" rel="noreferrer">{c.apiDocs}</a>
      </section>
    </Step>
    <p role="note" className="rounded-lg border border-warning p-3 text-sm">{c.secNote}</p>
  </div>;
}
