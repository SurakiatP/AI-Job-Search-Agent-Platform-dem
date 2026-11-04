import { CalendarClock, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { dateLocale } from '../../../lib/locale';
import type { AdminUserStatus } from '../../../lib/api-types';

export const USER_RANGES = ['7d', '30d', '90d', 'all'] as const;
export type UserRange = (typeof USER_RANGES)[number];

const variant = { active: 'success', suspended: 'warning', deleting: 'danger' } as const;

/** Status as a written label, never colour alone. */
export function StatusBadge({ status }: { status: AdminUserStatus }) {
  const { t } = useTranslation('admin-users');
  return <Badge variant={variant[status]}>{t(`status.${status}`)}</Badge>;
}

// ponytail: RangeMenu in ui/ offers all 12 ranges and has no option list; this is the same menu limited to the four the users list supports.
export function RangeSelect({ value, onChange }: { value: UserRange; onChange: (range: UserRange) => void }) {
  const { t } = useTranslation('admin-users');
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" aria-label={`${t('rangeLabel')}: ${t(`range.${value}`)}`}>
        <CalendarClock className="size-4" aria-hidden="true" />{t(`range.${value}`)}<ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-48">
      <DropdownMenuRadioGroup value={value} onValueChange={v => onChange(v as UserRange)}>
        {USER_RANGES.map(r => <DropdownMenuRadioItem key={r} value={r}>{t(`range.${r}`)}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];

/** Date formats in the app's language: Thai calendar for Thai, day-month-year for English. */
export function useDates() {
  const { i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const full = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return {
    day: (iso: string) => day.format(new Date(iso)),
    full: (iso: string) => full.format(new Date(iso)),
    relative(iso: string) {
      const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
      const [unit, size] = UNITS.find(([, s]) => Math.abs(seconds) >= s) ?? UNITS[UNITS.length - 1];
      return rel.format(Math.round(seconds / size), unit);
    },
  };
}
