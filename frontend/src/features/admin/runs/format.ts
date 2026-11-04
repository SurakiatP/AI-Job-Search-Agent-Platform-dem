import { dateLocale } from '../../../lib/locale';
import type { AdminRunStatus } from '../../../lib/api-types';

/** Task names the filter offers: the 13 operations the app already translates (common: workspace.operations) plus OCR. */
export const OPERATIONS = ['evaluate_job', 'draft_documents', 'export_document', 'profile_cv', 'match_jobs', 'extract_experience', 'tailor_cv', 'apply_prepare', 'apply_submit', 'draft_follow_up', 'interview_generate', 'interview_grade', 'interview_report', 'document_ocr'] as const;
export const STATUSES: AdminRunStatus[] = ['queued', 'running', 'waiting_approval', 'needs_input', 'completed', 'failed', 'cancelled', 'interrupted'];
export const LIVE: ReadonlySet<AdminRunStatus> = new Set(['queued', 'running']);
export const CANCELLABLE: ReadonlySet<AdminRunStatus> = new Set(['queued', 'running', 'waiting_approval', 'needs_input']);
export const RETRYABLE: ReadonlySet<AdminRunStatus> = new Set(['failed', 'interrupted', 'cancelled']);

const TZ = 'Asia/Bangkok';

export function formatTime(iso: string | null, locale: string, seconds = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: 'medium', timeStyle: seconds ? 'medium' : 'short', timeZone: TZ }).format(d);
}

export function formatDuration(seconds: number | null, unit: { s: string; m: string; h: string }): string {
  if (seconds === null) return '—';
  const total = Math.round(seconds);
  if (total < 60) return `${total} ${unit.s}`;
  if (total < 3600) return `${Math.floor(total / 60)} ${unit.m} ${total % 60} ${unit.s}`;
  return `${Math.floor(total / 3600)} ${unit.h} ${Math.floor((total % 3600) / 60)} ${unit.m}`;
}

export const formatLatency = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

export const compact = (n: number, locale: string) => new Intl.NumberFormat(dateLocale(locale), { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** null stays a dash: no price is known, which is not the same as free. */
export function formatCost(usd: number | null, manual: boolean): string {
  if (usd === null) return '—';
  const text = `$${usd >= 0.01 || usd === 0 ? usd.toFixed(2) : usd.toFixed(4)}`;
  return manual ? `≈ ${text}` : text;
}

/** `since` for a range key, computed when the request is made so a refresh keeps the window moving. */
export function sinceFor(range: string | null, now = Date.now()): string | undefined {
  const m = /^(\d+)([mhd])$/.exec(range ?? '');
  if (!m) return undefined;
  return new Date(now - Number(m[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 'm' | 'h' | 'd']).toISOString();
}
