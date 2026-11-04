import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { AdminIngestRun } from '@/lib/api-types';
import { SectionCard } from '../../settings/Field';
import { Sheet } from '../ui';
import { DataTable, Td, Tr } from './DataTable';
import { useWhen } from './format';

const variant = { complete: 'success', partial: 'warning', failed: 'danger' } as const;

export function IngestCard({ ingest }: { ingest: AdminIngestRun[] }) {
  const { t } = useTranslation('admin-system');
  const when = useWhen();
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...ingest].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const latest = sorted.filter((r, i) => sorted.findIndex(x => x.board === r.board) === i);
  const history = sorted.filter(r => r.board === open);
  const status = (r: AdminIngestRun) => <Badge variant={variant[r.status]}>{t(`ingest.status.${r.status}`)}</Badge>;
  return <SectionCard title={t('ingest.title')} description={t('ingest.description')}>
    {latest.length === 0 ? <div className="rounded-lg border border-dashed p-4"><p className="font-medium">{t('ingest.empty')}</p><p className="text-sm text-muted-foreground">{t('ingest.emptyHint')}</p></div>
      : <DataTable label={t('ingest.title')} head={[t('ingest.board'), t('ingest.statusHead'), t('ingest.found'), t('ingest.new'), t('ingest.error'), t('ingest.when')]}>
        {latest.map(r => <Tr key={r.board} onClick={row => { row.querySelector('button')?.focus(); setOpen(r.board); }}>
          <Td label={t('ingest.board')}><button type="button" className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('ingest.open', { board: r.board })}>{r.board}</button></Td>
          <Td label={t('ingest.statusHead')}>{status(r)}</Td>
          <Td label={t('ingest.found')}><span className="tabular-nums">{r.jobs_total}</span></Td>
          <Td label={t('ingest.new')}><span className="tabular-nums">{r.jobs_new}</span></Td>
          <Td label={t('ingest.error')}>{r.error_code ? <code className="text-xs">{r.error_code}</code> : <span className="text-muted-foreground">–</span>}</Td>
          <Td label={t('ingest.when')}><span className="tabular-nums">{when.full(r.at)}</span></Td>
        </Tr>)}
      </DataTable>}
    <Sheet open={open !== null} onOpenChange={o => { if (!o) setOpen(null); }} title={t('ingest.historyTitle', { board: open ?? '' })} subtitle={t('ingest.historyNote')} closeLabel={t('close')}>
      <DataTable label={t('ingest.historyTitle', { board: open ?? '' })} head={[t('ingest.when'), t('ingest.statusHead'), t('ingest.found'), t('ingest.new'), t('ingest.error')]}>
        {history.map(r => <Tr key={r.at}>
          <Td label={t('ingest.when')}><span className="tabular-nums">{when.full(r.at)}</span></Td>
          <Td label={t('ingest.statusHead')}>{status(r)}</Td>
          <Td label={t('ingest.found')}><span className="tabular-nums">{r.jobs_total}</span></Td>
          <Td label={t('ingest.new')}><span className="tabular-nums">{r.jobs_new}</span></Td>
          <Td label={t('ingest.error')}>{r.error_code ? <code className="text-xs">{r.error_code}</code> : <span className="text-muted-foreground">–</span>}</Td>
        </Tr>)}
      </DataTable>
    </Sheet>
  </SectionCard>;
}
