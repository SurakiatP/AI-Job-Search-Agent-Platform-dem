import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAccount } from '../../lib/api';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import type { Copy } from './copy';
import { CopyButton } from './shared';
import { clients, type Client, type Lang } from './clients';

const PICK_KEY = 'connect.client';
const isLocal = (origin: string) => /^https?:\/\/(127\.|localhost|\[::1\])/.test(origin) || origin.startsWith('http://');

function ClientPicker({ c, lang, list, local }: { c: Copy; lang: Lang; list: Client[]; local: boolean }) {
  const [id, setId] = useState(() => localStorage.getItem(PICK_KEY) ?? list[0].id);
  const client = list.find(item => item.id === id) ?? list[0];
  const pick = (value: string) => { setId(value); localStorage.setItem(PICK_KEY, value); };
  return <div className="grid gap-5">
    <div className="grid gap-1.5">
      <label htmlFor="connect-client" className="text-sm font-medium">{c.pickClient}</label>
      <select id="connect-client" value={client.id} onChange={e => pick(e.target.value)} className="min-h-10 max-w-md rounded-md border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {list.map(item => <option key={item.id} value={item.id}>{item.vendor ? `${item.name} · ${item.vendor}` : item.name}</option>)}
      </select>
    </div>
    <section aria-labelledby="connect-client-name" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="connect-client-name" className="font-semibold">{client.name}</h3>
        {client.protocols.map(p => <Badge key={p} variant="secondary">{p}</Badge>)}
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">{client.hint[lang]}</p>
      {client.needsPublicHttps && local && <p role="note" className="rounded-lg border border-warning p-3 text-sm">{c.needsHttps}</p>}
      {client.snippets.map(s => <Block key={s.label.en} c={c} label={s.label[lang]} where={s.where} text={s.code} />)}
      {client.protocols.includes('REST') && <a className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/api/v1/docs" target="_blank" rel="noreferrer">{c.apiDocs}</a>}
    </section>
  </div>;
}

const START = 'uv run --locked --project backend python scripts/run_local.py --enable-sharing --share-host 127.0.0.1 --share-port 8011';
type Info = { share_origin: string | null; oauth: boolean };

function Block({ text, c, label, where }: { text: string; c: Copy; label: string; where?: string }) {
  return <div className="grid gap-2">
    <span className="text-sm font-medium">{label}{where && <code className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal">{where}</code>}</span>
    <pre className="overflow-x-auto rounded-lg border bg-muted p-3 text-xs" tabIndex={0} aria-label={label}><code>{text}</code></pre>
    <div><CopyButton text={text} c={c} label={label} /></div>
  </div>;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-3 text-base">
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm text-primary-foreground">{n}</span>{title}
  </CardTitle></CardHeader><CardContent className="grid gap-5">{children}</CardContent></Card>;
}

export function ConnectTab({ c, lang, projectId, onIssue }: { c: Copy; lang: Lang; projectId: string; onIssue: () => void }) {
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
  return <div className="grid gap-6">
    <p className="max-w-prose text-sm text-muted-foreground">{c.connectIntro}</p>
    <p role="status" className="text-sm font-medium text-success">{c.ready}</p>
    <Step n={1} title={c.step1}>
      <p className="max-w-prose text-sm text-muted-foreground">{c.step1Body}</p>
      {info.data.oauth && <p className="max-w-prose text-sm text-muted-foreground">{c.oauthNote}</p>}
      <div><Button type="button" onClick={onIssue}>{c.issue}</Button></div>
    </Step>
    <Step n={2} title={c.step2}>
      <ClientPicker c={c} lang={lang} list={clients(share, api, projectId)} local={isLocal(share)} />
    </Step>
    <p role="note" className="rounded-lg border border-warning p-3 text-sm">{c.secNote}</p>
  </div>;
}
