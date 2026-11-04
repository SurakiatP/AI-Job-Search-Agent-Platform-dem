import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { AdminProbe, AdminSystem } from '@/lib/api-types';
import { SectionCard } from '../../settings/Field';
import { Tip } from '../ui';
import { useWhen } from './format';

const KEYS = ['postgres', 'object_store', 'llm_gateway', 'sandbox'] as const;
type Key = (typeof KEYS)[number];
const SLOTS = 48, SLOT_MS = 30 * 60_000; // 24 h in 30-minute slots
type Slot = { from: number; to: number; state: 'ok' | 'warn' | 'bad' | 'none' };
const tone = { ok: 'bg-success', warn: 'bg-warning', bad: 'bg-destructive', none: 'bg-muted' } as const;

function slotsFor(probes: AdminProbe[], key: Key, end: number): Slot[] {
  const start = end - SLOTS * SLOT_MS;
  const count = Array.from({ length: SLOTS }, () => ({ ok: 0, down: 0 }));
  for (const p of probes) {
    const at = Date.parse(p.checked_at);
    if (at < start || at > end) continue;
    count[Math.min(SLOTS - 1, Math.floor((at - start) / SLOT_MS))][p.components[key] === 'ok' ? 'ok' : 'down']++;
  }
  return count.map((c, i) => ({ from: start + i * SLOT_MS, to: start + (i + 1) * SLOT_MS, state: c.ok + c.down === 0 ? 'none' : c.down === 0 ? 'ok' : c.ok === 0 ? 'bad' : 'warn' }));
}

export function HealthCard({ system }: { system: AdminSystem }) {
  const { t } = useTranslation('admin-system');
  const when = useWhen();
  const end = Date.parse(system.generated_at);
  const down = KEYS.filter(k => system.health.components[k] !== 'ok');
  return <SectionCard title={t('health.title')} description={t('health.description')}>
    {down.length === 0
      ? <Alert severity="success">{t('health.allOk')}</Alert>
      : <Alert severity="error">{t('health.someDown', { count: down.length, names: down.map(k => t(`health.components.${k}.name`)).join(', ') })}</Alert>}
    <ul className="grid">
      {KEYS.map(key => {
        const up = system.health.components[key] === 'ok';
        const mine = system.probes.filter(p => Date.parse(p.checked_at) >= end - SLOTS * SLOT_MS);
        const passed = mine.filter(p => p.components[key] === 'ok').length;
        const pct = String(Math.round((passed / Math.max(1, mine.length)) * 1000) / 10);
        const name = t(`health.components.${key}.name`);
        return <li key={key} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t py-3 first:border-t-0 sm:grid-cols-[1.25rem_12rem_minmax(0,1fr)_4.5rem]">
          {up ? <CheckCircle2 className="size-5 text-success" aria-hidden="true" /> : <XCircle className="size-5 text-destructive" aria-hidden="true" />}
          <div className="min-w-0">
            <p className="font-medium"><span>{name}</span> <span className={cn('ms-1 text-sm font-medium', up ? 'text-success' : 'text-destructive')}>{t(up ? 'health.working' : 'health.down')}</span></p>
            <p className="text-xs text-muted-foreground">{t(`health.components.${key}.hint`)}</p>
          </div>
          <p className="text-end text-sm tabular-nums text-muted-foreground sm:col-start-4 sm:row-start-1">{mine.length ? t('health.uptime', { percent: pct }) : t('health.noData')}</p>
          <div role="img" aria-label={t('health.stripLabel', { name, ok: passed, total: mine.length })} className="col-span-full grid h-7 grid-cols-[repeat(48,minmax(0,1fr))] gap-0.5 sm:col-span-1 sm:col-start-3 sm:row-start-1">
            {slotsFor(system.probes, key, end).map(s => <Tip key={s.from} className="flex h-full" text={`${when.dayClock(s.from)}–${when.clock(s.to)} · ${t(`health.slot.${s.state}`)}`}>
              <i className={cn('block h-full w-full origin-bottom rounded-sm transition-transform duration-150 motion-safe:hover:scale-y-110', tone[s.state])} />
            </Tip>)}
          </div>
        </li>;
      })}
      <li aria-hidden="true" className="grid grid-cols-1 sm:grid-cols-[1.25rem_12rem_minmax(0,1fr)_4.5rem] sm:gap-x-3">
        <div className="flex justify-between text-xs text-muted-foreground sm:col-start-3"><span>{t('health.axisStart')}</span><span>{t('health.axisEnd')}</span></div>
      </li>
    </ul>
  </SectionCard>;
}
