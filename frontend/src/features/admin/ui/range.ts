export const RANGES = ['1m', '5m', '10m', '15m', '30m', '1h', '4h', '10h', '7d', '30d', '90d', 'all'] as const;
export type RangeKey = (typeof RANGES)[number];
export const DEFAULT_RANGE: RangeKey = '7d';

export const isRangeKey = (v: unknown): v is RangeKey => RANGES.includes(v as RangeKey);

/** Window length in seconds; `all` has none. */
export const RANGE_SECONDS: Record<Exclude<RangeKey, 'all'>, number> = {
  '1m': 60, '5m': 300, '10m': 600, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '10h': 36000,
  '7d': 604800, '30d': 2592000, '90d': 7776000,
};

/** Bucket width in seconds (spec): `all` uses weeks (months after 2 years, decided by the backend). */
export const RANGE_BUCKET_SECONDS: Record<RangeKey, number> = {
  '1m': 5, '5m': 15, '10m': 30, '15m': 60, '30m': 60, '1h': 120, '4h': 600, '10h': 1800,
  '7d': 86400, '30d': 86400, '90d': 86400, all: 604800,
};

/** Auto refresh: every 10 s up to 15 minutes, every 30 s beyond. */
export const rangeRefreshMs = (r: RangeKey) => (r === '1m' || r === '5m' || r === '10m' || r === '15m' ? 10_000 : 30_000);

/** `all` has no previous window, so change chips and the dashed line are hidden. */
export const rangeHasComparison = (r: RangeKey) => r !== 'all';

const TZ = 'Asia/Bangkok';

/** Axis and tooltip label for a bucket start: seconds under 1 minute buckets, clock time within a day, date after. */
export function formatBucketLabel(ts: string | number | Date, range: RangeKey, locale: string) {
  const d = new Date(ts);
  const bucket = RANGE_BUCKET_SECONDS[range];
  const opts: Intl.DateTimeFormatOptions = bucket < 60 ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
    : bucket < 86400 ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: TZ }).format(d);
}
