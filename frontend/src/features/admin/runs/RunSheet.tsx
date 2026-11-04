import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { admin } from '../../../lib/api';
import { ApiError, type AdminLlmCall, type AdminRunDetail, type AdminRunEvent, type AdminRunItem, type AdminPriceSource } from '../../../lib/api-types';
import { Sheet } from '../ui';
import { CANCELLABLE, compact, formatCost, formatDuration, formatLatency, formatTime, LIVE, RETRYABLE } from './format';
import { useOperationLabel } from './useOperationLabel';

type Action = 'cancel' | 'retry';

/** Right-hand sheet for one run: summary, public event timeline, model calls, and the cancel / retry actions. */
export function RunSheet({ runId, onClose, onOpen, onChanged }: {
  runId: string | null; onClose: () => void; onOpen: (id: string) => void; onChanged: (run: AdminRunItem | null) => void;
}) {
  const { t, i18n } = useTranslation('admin-runs');
  const lang = i18n.language;
  const operationLabel = useOperationLabel();
  const [detail, setDetail] = useState<AdminRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);

  const latest = useRef(runId);
  latest.current = runId;
  const fetchDetail = useCallback(async (id: string, quiet: boolean) => {
    if (!quiet) { setDetail(null); setError(null); }
    try {
      const d = await admin.run(id);
      if (latest.current !== id) return; // the sheet moved to another run while this was loading
      setDetail(d);
      onChanged(d.run);
    } catch (caught) {
      if (!quiet && latest.current === id) setError(caught instanceof ApiError && caught.code === 'not_found' ? t('err.not_found') : t('sheet.loadError'));
    }
  }, [onChanged, t]);

  useEffect(() => { if (runId) void fetchDetail(runId, false); }, [runId]); // eslint-disable-line react-hooks/exhaustive-deps

  const running = detail ? LIVE.has(detail.run.status) : false;
  useEffect(() => {
    if (!runId || !running) return;
    const timer = window.setInterval(() => void fetchDetail(runId, true), 10_000);
    return () => window.clearInterval(timer);
  }, [runId, running, fetchDetail]);

  const run = detail?.run;
  const done = (next: AdminRunDetail, kind: Action) => {
    setAction(null);
    if (kind === 'retry') { onChanged(null); onOpen(next.run.id); } // the new run opens in this sheet; the list reloads to show it
    else { setDetail(next); onChanged(next.run); }
  };

  return <>
    <Sheet open={runId !== null} onOpenChange={open => { if (!open) onClose(); }} closeLabel={t('sheet.close')}
      title={run ? operationLabel(run.operation) : t('sheet.title')}
      subtitle={run ? <span className="flex flex-wrap items-center gap-2"><StatusBadge status={run.status} locale={lang.startsWith('th') ? 'th' : 'en'} /><span className="font-mono text-xs">{run.id.slice(0, 8)}</span></span> : undefined}
      footer={run && (CANCELLABLE.has(run.status) || RETRYABLE.has(run.status)) ? <>
        {CANCELLABLE.has(run.status) && <Button variant="destructive" onClick={() => setAction('cancel')}>{t('actions.cancel')}</Button>}
        {RETRYABLE.has(run.status) && <Button onClick={() => setAction('retry')}>{t('actions.retry')}</Button>}
      </> : undefined}>
      {error ? <Alert severity="error" action={<Button variant="outline" size="sm" onClick={() => runId && void fetchDetail(runId, false)}>{t('sheet.retry')}</Button>}>{error}</Alert>
        : !detail || !run ? <div role="status" aria-label={t('loading')} className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-40" /><Skeleton className="h-24" /></div>
        : <>
          {run.failure_key && <Alert severity="error"><p className="font-medium">{t('sheet.failure')}</p><p>{messageText(t, i18n, run.failure_key) ?? t('msg.errors.run_failed')}</p></Alert>}
          <Summary run={run} onOpen={onOpen} />
          <Timeline events={detail.events} />
          <Calls calls={detail.calls} />
        </>}
    </Sheet>
    {action && run && <ConfirmAction kind={action} run={run} onClose={() => setAction(null)} onDone={next => done(next, action)} onStale={() => void fetchDetail(run.id, true)} />}
  </>;
}

type T = ReturnType<typeof useTranslation>['t'];
/** A message key from the run (errors.*, events.*, approvals.*): translated when we know it, null when we do not. */
function messageText(t: T, i18n: { exists: (key: string, o?: { ns: string }) => boolean }, key: string | null): string | null {
  const full = `msg.${key}`;
  return key && i18n.exists(full, { ns: 'admin-runs' }) ? t(full) : null;
}

function Summary({ run, onOpen }: { run: AdminRunItem; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation('admin-runs');
  const lang = i18n.language;
  const unit = t('dur', { returnObjects: true }) as { s: string; m: string; h: string };
  const rows: [string, ReactNode][] = [
    [t('sheet.runId'), <code key="id" className="break-all text-xs">{run.id}</code>],
    [t('sheet.user'), run.user_short_id ? <code className="text-xs">{run.user_short_id}</code> : '—'],
    [t('sheet.created'), formatTime(run.created_at, lang, true)],
    [t('sheet.started'), formatTime(run.started_at, lang, true)],
    [t('sheet.finished'), formatTime(run.finished_at, lang, true)],
    [t('sheet.duration'), formatDuration(run.duration_seconds, unit)],
    [t('sheet.model'), run.model ? <>{run.model}{run.effort ? <span className="text-muted-foreground"> · {t('effort', { value: run.effort })}</span> : null}</> : '—'],
    [t('sheet.tokens'), <span key="tok" className="tabular-nums">{compact(run.input_tokens, lang)} {t('tokens.in')} · {compact(run.output_tokens, lang)} {t('tokens.out')} · {compact(run.cached_tokens, lang)} {t('tokens.cached')}</span>],
    [t('sheet.cost'), <span key="cost" className="tabular-nums">{formatCost(run.cost_usd, run.cost_is_manual)}</span>],
  ];
  if (run.retry_of_id) rows.push([t('sheet.retryOf'), <button key="orig" type="button" className="rounded font-mono text-xs text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring" aria-label={t('sheet.openOriginal', { id: run.retry_of_id.slice(0, 8) })} onClick={() => onOpen(run.retry_of_id!)}>{run.retry_of_id.slice(0, 8)}</button>]);
  return <section aria-labelledby="run-summary" className="grid gap-2">
    <h3 id="run-summary" className="text-sm font-semibold">{t('sheet.summary')}</h3>
    <dl className="grid grid-cols-[minmax(6rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v], i) => <div key={i} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{v}</dd></div>)}
    </dl>
  </section>;
}

function Timeline({ events }: { events: AdminRunEvent[] }) {
  const { t, i18n } = useTranslation('admin-runs');
  const lang = i18n.language;
  return <section aria-labelledby="run-timeline" className="grid gap-2">
    <h3 id="run-timeline" className="text-sm font-semibold">{t('sheet.timeline')}</h3>
    {events.length === 0 ? <p className="text-sm text-muted-foreground">{t('sheet.noEvents')}</p>
      : <ol className="grid">{events.map((e, i) => {
        const label = t(`event.${e.event_type}`, { defaultValue: t('event.other') });
        const message = messageText(t, i18n, e.message_key);
        const extra = [e.model, e.latency_ms !== null ? formatLatency(e.latency_ms) : null, e.input_tokens !== null || e.output_tokens !== null ? `${e.input_tokens ?? 0} ${t('tokens.in')} / ${e.output_tokens ?? 0} ${t('tokens.out')}` : null].filter(Boolean).join(' · ');
        return <li key={e.sequence} className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
          {i < events.length - 1 && <span aria-hidden="true" className="absolute start-[0.4375rem] top-4 bottom-0 w-px bg-border" />}
          <span aria-hidden="true" className="relative mt-1.5 size-3.5 rounded-full border-2 border-primary bg-card" />
          <div className="min-w-0 text-sm">
            <p className="flex flex-wrap items-baseline gap-x-2"><span className="font-medium">{label}</span>{e.step && <code className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{e.step}</code>}</p>
            {message && <p className="text-muted-foreground">{message}</p>}
            {extra && <p className="text-xs tabular-nums text-muted-foreground">{extra}</p>}
            <time dateTime={e.created_at} className="text-xs tabular-nums text-muted-foreground">{formatTime(e.created_at, lang, true)}</time>
          </div>
        </li>;
      })}</ol>}
  </section>;
}

function PriceBadge({ source }: { source: AdminPriceSource | null }) {
  const { t } = useTranslation('admin-runs');
  if (source === 'manual') return <Badge variant="warning">{t('priceSource.manual')}</Badge>;
  if (source) return <Badge variant="muted">{t(`priceSource.${source}`)}</Badge>;
  return <Badge variant="muted">{t('priceSource.none')}</Badge>;
}

function Calls({ calls }: { calls: AdminLlmCall[] }) {
  const { t, i18n } = useTranslation('admin-runs');
  const lang = i18n.language;
  return <section aria-labelledby="run-calls" className="grid gap-2">
    <h3 id="run-calls" className="text-sm font-semibold">{t('sheet.calls')}</h3>
    {calls.length === 0 ? <p className="text-sm text-muted-foreground">{t('sheet.noCalls')}</p>
      : <table className="w-full text-sm">
        <thead><tr className="text-start text-xs text-muted-foreground">
          {(['model', 'tokens', 'latency', 'cost'] as const).map(c => <th key={c} scope="col" className={`py-1.5 pe-2 font-medium ${c === 'model' || c === 'tokens' ? 'text-start' : 'text-end'}`}>{t(`sheet.callCols.${c}`)}</th>)}
        </tr></thead>
        <tbody>{calls.map((c, i) => <tr key={i} className="border-t align-top">
          <td className="min-w-0 py-2 pe-2 [overflow-wrap:anywhere]"><div>{c.model}</div><div className="mt-1 flex flex-wrap items-center gap-1"><PriceBadge source={c.price_source} /><span className="text-xs text-muted-foreground">{t('sheet.apiCalls', { count: c.api_calls })}</span></div></td>
          <td className="py-2 pe-2 text-xs tabular-nums"><div>{compact(c.input_tokens, lang)} {t('tokens.in')}</div><div>{compact(c.output_tokens, lang)} {t('tokens.out')}</div><div className="text-muted-foreground">{compact(c.cached_tokens, lang)} {t('tokens.cached')}</div></td>
          <td className="py-2 pe-2 text-end tabular-nums">{formatLatency(c.latency_ms)}</td>
          <td className="py-2 text-end tabular-nums">{formatCost(c.cost_usd, c.price_source === 'manual')}</td>
        </tr>)}</tbody>
      </table>}
  </section>;
}

/** Small confirm dialog. Retry says plainly that it reruns for the same user and that the admin cannot see the inputs. */
function ConfirmAction({ kind, run, onClose, onDone, onStale }: {
  kind: Action; run: AdminRunItem; onClose: () => void; onDone: (next: AdminRunDetail) => void; onStale: () => void;
}) {
  const { t } = useTranslation('admin-runs');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const operationLabel = useOperationLabel();
  async function confirm() {
    setBusy(true); setError(null);
    try { onDone(await (kind === 'cancel' ? admin.cancelRun(run.id) : admin.retryRun(run.id))); }
    catch (caught) {
      const code = caught instanceof ApiError ? caught.code : '';
      setError(t(`err.${code}`, { defaultValue: t('err.request') }));
      setBusy(false);
      if (code === 'run_finished' || code === 'retry_not_allowed' || code === 'not_found') { setStale(true); onStale(); } // the run moved on: no second try, and the sheet behind reloads
    }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogTitle>{t(`actions.${kind}Title`)}</DialogTitle>
      <DialogDescription>{operationLabel(run.operation)} · <code>{run.id.slice(0, 8)}</code></DialogDescription>
      <p className="text-sm">{t(`actions.${kind}Body`)}</p>
      {error && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild><Button variant="outline" disabled={busy}>{stale ? t('actions.back') : t(`actions.${kind}Keep`)}</Button></DialogClose>
        {!stale && <Button variant={kind === 'cancel' ? 'destructive' : 'default'} busy={busy} onClick={() => void confirm()}>{t(`actions.${kind}Confirm`)}</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
