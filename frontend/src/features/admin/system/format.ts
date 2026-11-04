import { useTranslation } from 'react-i18next';
import { dateLocale } from '@/lib/locale';

const TZ = 'Asia/Bangkok';

/** Date and time formatters for the admin pages: Thai calendar for Thai, Bangkok time in both. */
export function useWhen() {
  const loc = dateLocale(useTranslation().i18n.language);
  const full = new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });
  const clock = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
  const dayClock = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
  return { full: (v: string | number) => full.format(new Date(v)), clock: (v: string | number) => clock.format(new Date(v)), dayClock: (v: string | number) => dayClock.format(new Date(v)) };
}
