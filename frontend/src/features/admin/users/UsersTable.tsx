import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { AdminUserItem } from '../../../lib/api-types';
import { Tip } from '../ui';
import { StatusBadge, useDates } from './shared';

const th = 'px-4 py-2.5 text-start text-xs font-medium text-muted-foreground';
const td = 'px-4 py-3 align-middle';

export function UsersTable({ items, onOpen }: { items: AdminUserItem[]; onOpen: (user: AdminUserItem) => void }) {
  const { t } = useTranslation('admin-users');
  const d = useDates();
  const seen = (u: AdminUserItem) => u.last_seen_at
    ? <Tip text={d.full(u.last_seen_at)}><time dateTime={u.last_seen_at}>{d.relative(u.last_seen_at)}</time></Tip>
    : t('never');
  return <div className="overflow-hidden rounded-xl border bg-card">
    <table aria-label={t('tableLabel')} className="w-full table-fixed border-collapse text-sm">
      <thead>
        <tr className="border-b bg-muted/40">
          <th scope="col" className={th}>{t('col.email')}</th>
          <th scope="col" className={`${th} w-28 sm:w-32`}>{t('col.status')}</th>
          <th scope="col" className={`${th} hidden w-32 lg:table-cell`}>{t('col.verified')}</th>
          <th scope="col" className={`${th} hidden w-36 md:table-cell`}>{t('col.created')}</th>
          <th scope="col" className={`${th} hidden w-36 sm:table-cell`}>{t('col.lastSeen')}</th>
          <th scope="col" className={`${th} hidden w-32 text-end sm:table-cell`}>{t('col.runs')}</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {items.map(u => <tr key={u.id} onClick={() => onOpen(u)} className="cursor-pointer transition-colors hover:bg-primary/[0.04]">
          <td className={td}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <button type="button" onClick={e => { e.stopPropagation(); onOpen(u); }}
                className="min-h-6 min-w-0 cursor-pointer rounded text-start font-medium [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{u.email}</button>
              {u.is_admin ? <Badge variant="default">{t('adminBadge')}</Badge> : null}
            </div>
            <div className="mt-1 text-xs text-muted-foreground sm:hidden">{t('col.lastSeen')}: {seen(u)}</div>
          </td>
          <td className={td}><StatusBadge status={u.status} /></td>
          <td className={`${td} hidden text-muted-foreground lg:table-cell`}>{u.email_verified ? t('verified') : t('unverified')}</td>
          <td className={`${td} hidden tabular-nums text-muted-foreground md:table-cell`}>{d.day(u.created_at)}</td>
          <td className={`${td} hidden text-muted-foreground sm:table-cell`}>{seen(u)}</td>
          <td className={`${td} hidden text-end tabular-nums sm:table-cell`}>{u.runs_in_range.toLocaleString()}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}
