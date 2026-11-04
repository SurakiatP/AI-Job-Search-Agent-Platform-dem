import { useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { admin } from '@/lib/api';
import { ApiError, type AdminModelCatalogItem } from '@/lib/api-types';
import { dateLocale } from '@/lib/locale';

/** Tasks that have a gold test set (backend services/benchmark.py TASK_OF). The other tasks go straight to the typed confirmation. */
export const TESTABLE = new Set(['evaluate_job', 'draft_documents', 'extract_experience', 'tailor_cv', 'apply_prepare', 'interview_generate', 'interview_grade', 'interview_report', 'document_ocr']);
/** The phrase PUT /tasks/{op} expects when the verdict is not green. Same text in Thai and English. */
export const CONFIRM = 'ใช้โมเดลนี้';
export const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'default'] as const;
export const POLL_MS = 2000;

export function useLoad<T>(fn: () => Promise<T>) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setState(s => ({ data: s.data, loading: true }));
    fn().then(data => { if (live) setState({ data, loading: false }); }, error => { if (live) setState({ error, loading: false }); });
    return () => { live = false; };
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: () => setN(x => x + 1) };
}

export const errText = (t: TFunction, e: unknown) => (e instanceof ApiError ? t(`error.${e.code}`, { defaultValue: t('error.generic') }) : t('error.generic'));

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
export const perMillion = (n: number | null) => (n == null ? '—' : `$${usd.format(n)}`);
export const perCall = (n: number | null) => (n == null ? '—' : `$${n.toFixed(5)}`);
export const score = (n: number) => n.toFixed(1);

/** Date and time in Asia/Bangkok; Thai uses the Buddhist calendar through th-TH. */
export function useWhen() {
  const { i18n } = useTranslation();
  const format = useMemo(() => new Intl.DateTimeFormat(dateLocale(i18n.language), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }), [i18n.language]);
  return (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : format.format(d); };
}

export type PriceDraft = { in: string; out: string; cache: string; free: boolean };
export const emptyPrice: PriceDraft = { in: '', out: '', cache: '', free: false };
const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) || Number(s) < 0 ? null : Number(s));
/** incomplete: a needed field is empty or not a number >= 0. needs_free: a price of 0 without the free box. */
export function priceState(d: PriceDraft): 'incomplete' | 'needs_free' | 'ok' {
  const vals = [num(d.in), num(d.out)];
  if (vals.some(v => v == null) || (d.cache.trim() !== '' && num(d.cache) == null)) return 'incomplete';
  const zero = [...vals, d.cache.trim() === '' ? 1 : num(d.cache)].some(v => v === 0);
  return zero && !d.free ? 'needs_free' : 'ok';
}
export const priceBody = (d: PriceDraft) => ({ price_in: num(d.in), price_out: num(d.out), price_cache: d.cache.trim() === '' ? null : num(d.cache), is_free: d.free });

export type Pick = { id: string; registered: boolean; priceIn: number | null; priceOut: number | null };
export const needsPrice = (p: Pick) => !p.registered && (p.priceIn == null || p.priceOut == null);
export const fromCatalog = (i: AdminModelCatalogItem): Pick => ({ id: i.id, registered: i.registered, priceIn: i.price_in, priceOut: i.price_out });

/** Debounced OpenRouter search. Stale answers are dropped. */
export function useCatalog(q: string, enabled: boolean) {
  const [s, setS] = useState<{ items: AdminModelCatalogItem[]; status: 'idle' | 'loading' | 'ready' | 'error' }>({ items: [], status: 'idle' });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) { setS({ items: [], status: 'idle' }); return; }
    let live = true;
    setS(x => ({ items: x.items, status: 'loading' }));
    const id = window.setTimeout(() => {
      admin.modelCatalog(q.trim()).then(items => { if (live) setS({ items, status: 'ready' }); }, () => { if (live) setS({ items: [], status: 'error' }); });
    }, 300);
    return () => { live = false; window.clearTimeout(id); };
  }, [q, enabled, n]);
  return { ...s, retry: () => setN(x => x + 1) };
}

export const taskName = (t: TFunction, op: string) => t(`task.${op}.name`, { defaultValue: op });

/** Day and short month in Asia/Bangkok ("4 พ.ย." in Thai). */
export function useDay() {
  const { i18n } = useTranslation();
  const format = useMemo(() => new Intl.DateTimeFormat(dateLocale(i18n.language), { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }), [i18n.language]);
  return (iso: string) => format.format(new Date(iso));
}
