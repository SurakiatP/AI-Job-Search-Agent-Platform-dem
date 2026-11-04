import { dateLocale } from '../../../lib/locale';

export type Currency = 'usd' | 'thb';

/** Money from USD. Small amounts keep 4 decimals so a $0.0004 call does not read as $0.00. */
export function money(usd: number, currency: Currency, rate: number, lang: string) {
  const v = currency === 'thb' ? usd * rate : usd;
  return `${currency === 'thb' ? '฿' : '$'}${new Intl.NumberFormat(dateLocale(lang), { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 }).format(v)}`;
}

export const count = (n: number, lang: string) => new Intl.NumberFormat(dateLocale(lang)).format(n);

/** `2026-10-01` (Bangkok day from the API) as a date; th renders the Buddhist year. UTC so the day never shifts. */
export const dayLabel = (key: string, lang: string) =>
  new Intl.DateTimeFormat(dateLocale(lang), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`));
