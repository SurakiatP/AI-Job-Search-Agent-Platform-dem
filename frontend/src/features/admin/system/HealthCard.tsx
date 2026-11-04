import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { dateLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';
import type { AdminSystem } from '@/lib/api-types';
import { RangeMenu, type RangeKey } from '../ui';
import { BarChart, type BarDatum } from './BarChart';

const KEYS = ['postgres', 'object_store', 'llm_gateway', 'sandbox'] as const;
const SLOW_MS = 2000;
const LEGEND = [['ok', 'bg-success'], ['slow', 'bg-warning'], ['down', 'bg-destructive-fill'], ['none', 'bg-muted']] as const;
const TZ = 'Asia/Bangkok';

export function HealthCard({ system, range, onRange, loading, stale }: { system: AdminSystem; range: RangeKey; onRange: (r: RangeKey) => void; loading: boolean; stale: boolean }) {
  const { t, i18n } = useTranslation('admin-system');
  const { t: tr } = useTranslation('admin-overview'); // the range labels are shared with the Overview
  const loc = dateLocale(i18n.language);
  const size = system.bucket_seconds;
  const pattern: Intl.DateTimeFormatOptions = size < 60 ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : size >= 86400 ? { day: 'numeric', month: 'short' }
    : size >= 3600 || ['7d', '30d', '90d', 'all'].includes(system.range) ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' };
  const at = new Intl.DateTimeFormat(loc, { ...pattern, hour12: false, timeZone: TZ });
  const timeOnly = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', ...(size < 60 ? { second: '2-digit' as const } : {}), hour12: false, timeZone: TZ });
  const formatMs = (ms: number) => ms >= 1000 ? t('health.seconds', { value: +(ms / 1000).toFixed(1) }) : t('health.ms', { value: Math.round(ms) });
  const formatAxis = (ms: number) => (ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`); // units stay short so a Thai label never wraps
  const down = KEYS.filter(k => system.health.components[k] !== 'ok');
  const empty = system.probes.length === 0 || system.probes.every(p => KEYS.every(k => p.components[k].checks === 0));
  const busy = loading || system.range !== range;

  return <Card aria-busy={busy}>
    <CardHeader className="sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="grid gap-1">
        <CardTitle>{t('health.title')}</CardTitle>
        <CardDescription>{t('health.description')}</CardDescription>
        <p className="text-sm font-medium text-foreground">{t('health.every')}</p>
      </div>
      <RangeMenu value={range} onChange={onRange} labelFor={r => tr(`range.${r}`)} menuLabel={tr('range.menu')} className="shrink-0 max-sm:w-full max-sm:justify-between" />
    </CardHeader>
    <CardContent className="grid gap-4">
      {stale ? <Alert severity="warning">{t('health.stale')}</Alert> : null}
      {down.length === 0
        ? <Alert severity="success">{t('health.allOk')}</Alert>
        : <Alert severity="error">{t('health.someDown', { count: down.length, names: down.map(k => t(`health.components.${k}.name`)).join(', ') })}</Alert>}
      <ul className={cn('grid transition-opacity duration-150', busy && 'opacity-60')}>
        {KEYS.map(key => {
          const up = system.health.components[key] === 'ok';
          const name = t(`health.components.${key}.name`);
          const cells = system.probes.map(p => p.components[key]);
          const checks = cells.reduce((n, c) => n + c.checks, 0);
          const failed = cells.reduce((n, c) => n + c.failed, 0);
          const pct = String(Math.round(((checks - failed) / Math.max(1, checks)) * 1000) / 10);
          const last = [...cells].reverse().find(c => c.checks > 0 && c.ms != null)?.ms ?? null;
          const bars: BarDatum[] = system.probes.map((p, i) => {
            const c = cells[i];
            const from = Date.parse(p.checked_at);
            const when = `${at.format(from)}–${timeOnly.format(from + size * 1000)}`;
            const slow = c.status === 'ok' && c.ms != null && c.ms > SLOW_MS;
            const status = c.status === 'unknown' ? 'none' : slow ? 'slow' : c.status;
            const detail = status === 'none' ? t('health.tip.none') : status === 'down' ? t('health.tip.down', { failed: c.failed, checks: c.checks })
              : `${t(slow ? 'health.tip.slow' : 'health.tip.ok')} · ${c.ms == null ? t('health.tip.noMs') : formatMs(c.ms)}`;
            return { key: from, status, ms: c.ms, text: `${when} · ${detail}` };
          });
          return <li key={key} className="grid gap-3 border-t py-4 first:border-t-0 first:pt-0">
            <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto]">
              {up ? <CheckCircle2 className="size-5 text-success" aria-hidden="true" /> : <XCircle className="size-5 text-destructive" aria-hidden="true" />}
              <div className="min-w-0">
                <p className="font-medium"><span>{name}</span> <span className={cn('ms-1 text-sm font-medium', up ? 'text-success' : 'text-destructive')}>{t(up ? 'health.working' : 'health.down')}</span></p>
                <p className="text-xs text-muted-foreground">{t(`health.components.${key}.hint`)}</p>
              </div>
              <p className="col-start-2 text-sm tabular-nums text-muted-foreground sm:col-start-3 sm:row-start-1 sm:text-end">
                {checks ? `${t('health.uptime', { percent: pct })} · ${last == null ? t('health.lastNone') : t('health.last', { time: formatMs(last) })}` : t('health.noData')}
              </p>
            </div>
            {empty ? <div className="ms-12 grid h-24 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">{t('health.noData')}</div>
              : <BarChart bars={bars} animateKey={system.range} formatAxis={formatAxis} sliderLabel={t('health.sliderLabel')} axisStart={at.format(Date.parse(system.probes[0].checked_at))} axisEnd={t('health.axisEnd')}
                  ariaLabel={t('health.chartLabel', { name, range: tr(`range.${system.range}`), ok: checks - failed, total: checks })} />}
          </li>;
        })}
      </ul>
      {empty ? <p className="text-sm text-muted-foreground">{t('health.empty')}</p> : null}
      <ul aria-label={t('health.legend')} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LEGEND.map(([k, colour]) => <li key={k} className="inline-flex items-center gap-1.5"><i className={cn('size-2.5 rounded-sm', colour)} aria-hidden="true" />{t(`health.tip.legend.${k}`)}</li>)}
      </ul>
    </CardContent>
  </Card>;
}
