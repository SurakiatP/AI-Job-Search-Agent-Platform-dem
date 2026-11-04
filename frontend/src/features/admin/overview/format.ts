import { dateLocale } from '../../../lib/locale';

const TZ = 'Asia/Bangkok';

/** Number, percent, baht and Bangkok-time formatters for one UI language. Cost arrives in USD; `rate` is the live USD to THB rate; null (rate unavailable) keeps USD. */
export function makeFmt(locale: string, rate: number | null) {
  const loc = dateLocale(locale);
  const int = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  const one = new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const baht = new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sym = rate == null ? '$' : '฿';
  const mul = rate ?? 1;
  const clock = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
  const full = new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });
  const day = new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeZone: TZ });
  const weekday = (long: boolean) => new Intl.DateTimeFormat(loc, { weekday: long ? 'long' : 'short', timeZone: 'UTC' });
  return {
    loc,
    n: (v: number) => int.format(v),
    pct: (fraction: number) => `${one.format(fraction * 100)}%`,
    /** USD to baht as a number (chart values). */
    thb: (usd: number) => usd * mul,
    baht: (thb: number, approx = false) => `${approx ? '≈ ' : ''}${sym}${baht.format(thb)}`,
    money: (usd: number, approx = false) => `${approx ? '≈ ' : ''}${sym}${baht.format(usd * mul)}`,
    time: (ts: string | Date) => clock.format(new Date(ts)),
    dateTime: (ts: string | Date) => full.format(new Date(ts)),
    date: (ts: string | Date) => day.format(new Date(ts)),
    /** Sunday-first index, like the API's weekday array. 2024-01-07 was a Sunday. */
    weekday: (index: number, long = false) => weekday(long).format(new Date(Date.UTC(2024, 0, 7 + index))),
  };
}
export type Fmt = ReturnType<typeof makeFmt>;
