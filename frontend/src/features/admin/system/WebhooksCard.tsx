import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { admin } from '@/lib/api';
import { ApiError, type AdminWebhookCounts, type AdminWebhookDelivery } from '@/lib/api-types';
import { SectionCard } from '../../settings/Field';
import { useResource } from '../../projects/useResource';
import { Segmented } from '../ui';
import { DataTable, Td, Tr } from './DataTable';
import { useWhen } from './format';

type Filter = 'dead' | 'pending' | 'all';
const variant = { pending: 'warning', delivered: 'success', dead: 'danger' } as const;

export function WebhooksCard({ counts, onChanged }: { counts: AdminWebhookCounts; onChanged: () => void }) {
  const { t } = useTranslation('admin-system');
  const when = useWhen();
  const [filter, setFilter] = useState<Filter>('dead');
  const list = useResource<AdminWebhookDelivery[]>(`/admin/webhooks${filter === 'all' ? '' : `?status=${filter}`}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [patched, setPatched] = useState<Record<string, AdminWebhookDelivery>>({});
  async function resend(d: AdminWebhookDelivery) {
    setBusy(d.id);
    try {
      const next = await admin.resendWebhook(d.id);
      setPatched(p => ({ ...p, [d.id]: next }));
      setNotes(n => ({ ...n, [d.id]: { ok: true, text: t('webhooks.resent') } }));
      onChanged();
    } catch (error) {
      setNotes(n => ({ ...n, [d.id]: { ok: false, text: t(error instanceof ApiError && error.code === 'delivery_not_dead' ? 'webhooks.notDead' : 'webhooks.resendFailed') } }));
    } finally { setBusy(null); }
  }
  const rows = (list.data ?? []).map(d => patched[d.id] ?? d);
  const head = [t('webhooks.event'), t('webhooks.endpoint'), t('webhooks.statusHead'), t('webhooks.created'), ''];
  return <SectionCard title={t('webhooks.title')} description={t('webhooks.description')}>
    <dl className="grid grid-cols-3 gap-3">
      {(['pending', 'delivered', 'dead'] as const).map(k => <div key={k} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{t(`webhooks.status.${k}`)}</dt><dd className="text-xl font-semibold tabular-nums">{counts[k]}</dd></div>)}
    </dl>
    <Segmented ariaLabel={t('webhooks.filter')} value={filter} onChange={setFilter} options={[{ value: 'dead', label: t('webhooks.status.dead') }, { value: 'pending', label: t('webhooks.status.pending') }, { value: 'all', label: t('webhooks.all') }]} />
    {list.status === 'error' && !list.data ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">{t('webhooks.loadError')}<Button variant="outline" size="sm" onClick={list.reload}>{t('retry')}</Button></div>
      : !list.data ? <p role="status" className="text-sm text-muted-foreground">{t('loading')}</p>
      : rows.length === 0 ? <div className="rounded-lg border border-dashed p-4"><p className="font-medium">{t(`webhooks.empty.${filter}`)}</p><p className="text-sm text-muted-foreground">{t(`webhooks.emptyHint.${filter}`)}</p></div>
      : <DataTable label={t('webhooks.title')} head={head}>
        {rows.map(d => <Tr key={d.id}>
          <Td label={t('webhooks.event')}><span className="font-medium">{d.event_type}</span>{d.user_short_id && <span className="block text-xs text-muted-foreground">{t('webhooks.user', { id: d.user_short_id })}</span>}</Td>
          <Td label={t('webhooks.endpoint')}>{d.host ? <code className="text-xs">{d.host}</code> : <span className="text-muted-foreground">–</span>}</Td>
          <Td label={t('webhooks.statusHead')}><Badge variant={variant[d.status]}>{t(`webhooks.status.${d.status}`)}</Badge>
            <span className="block text-xs text-muted-foreground">{t('webhooks.attempts', { count: d.attempts })}{d.last_status_code ? ` · ${t('webhooks.code', { code: d.last_status_code })}` : ''}</span></Td>
          <Td label={t('webhooks.created')}><span className="tabular-nums">{when.full(d.created_at)}</span></Td>
          <Td label="" className="max-sm:justify-end">
            {d.status === 'dead' && <Button variant="outline" size="sm" busy={busy === d.id} disabled={busy !== null} onClick={() => void resend(d)} aria-label={t('webhooks.resendLabel', { event: d.event_type, host: d.host ?? '' })}>{busy === d.id ? t('webhooks.resending') : t('webhooks.resend')}</Button>}
            {notes[d.id] && <p role={notes[d.id].ok ? 'status' : 'alert'} className={notes[d.id].ok ? 'mt-1 text-xs text-success' : 'mt-1 text-xs text-destructive'}>{notes[d.id].text}</p>}
          </Td>
        </Tr>)}
      </DataTable>}
  </SectionCard>;
}
