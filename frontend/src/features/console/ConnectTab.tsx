import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Copy } from './copy';
import { CopyButton } from './shared';

const START = 'uv run --locked --project backend python scripts/run_local.py --enable-sharing --share-host 127.0.0.1 --share-port 8001';

function Block({ text, c, label }: { text: string; c: Copy; label: string }) {
  return <div className="grid gap-2">
    <pre className="overflow-x-auto rounded-lg border bg-muted p-3 text-xs" tabIndex={0} aria-label={label}><code>{text}</code></pre>
    <div><CopyButton text={text} c={c} label={label} /></div>
  </div>;
}

export function ConnectTab({ c }: { c: Copy }) {
  const origin = `http://${window.location.hostname}:8001`;
  const endpoints = [[c.mcp, `${origin}/mcp`], [c.card, `${origin}/.well-known/agent-card.json`], [c.a2a, `${origin}/`]] as const;
  const snippet = JSON.stringify({ mcpServers: { 'job-search-platform': { type: 'http', url: `${origin}/mcp`, headers: { Authorization: 'Bearer <ACCESS_TOKEN>' } } } }, null, 2);
  const curl = `curl ${origin}/.well-known/agent-card.json`;
  return <div className="grid gap-6">
    <p className="max-w-prose text-sm text-muted-foreground">{c.connectIntro}</p>
    <Card><CardHeader><CardTitle>{c.startTitle}</CardTitle><p className="text-sm text-muted-foreground">{c.startNote}</p></CardHeader>
      <CardContent><Block text={START} c={c} label={c.startTitle} /></CardContent></Card>
    <Card><CardHeader><CardTitle>{c.endpoints}</CardTitle></CardHeader>
      <CardContent><ul className="grid gap-4">{endpoints.map(([label, url]) => <li key={label} className="grid gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex flex-wrap items-center gap-3"><code className="min-w-0 break-all rounded-md bg-muted px-2 py-1 text-sm">{url}</code><CopyButton text={url} c={c} label={label} /></div>
      </li>)}</ul></CardContent></Card>
    <Card><CardHeader><CardTitle>{c.snippetTitle}</CardTitle><p className="text-sm text-muted-foreground">{c.snippetNote}</p></CardHeader>
      <CardContent><Block text={snippet} c={c} label={c.snippetTitle} /></CardContent></Card>
    <Card><CardHeader><CardTitle>{c.curlTitle}</CardTitle></CardHeader>
      <CardContent><Block text={curl} c={c} label={c.curlTitle} /></CardContent></Card>
    <p role="note" className="rounded-lg border border-warning p-3 text-sm">{c.secNote}</p>
  </div>;
}
