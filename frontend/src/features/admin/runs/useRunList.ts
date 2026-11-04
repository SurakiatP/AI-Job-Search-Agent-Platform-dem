import { useCallback, useEffect, useRef, useState } from 'react';
import { admin } from '../../../lib/api';
import type { AdminRunItem, AdminRunStatus } from '../../../lib/api-types';
import { LIVE, sinceFor } from './format';

export type RunFilters = { status?: AdminRunStatus; operation?: string; model?: string; range: string; page: number };
type State = { status: 'loading' | 'ready' | 'error'; items: AdminRunItem[]; total: number; fetching: boolean };

const REFRESH_MS = 10_000;
export const RUN_PAGE_SIZE = 10;

/** One page of runs for one filter set. Old rows stay while the next page loads; a quiet 10 s refresh re-reads the current page while a visible run is queued or running. */
export function useRunList(filters: RunFilters, onOutOfRange: (lastPage: number) => void) {
  const key = JSON.stringify(filters);
  const [state, setState] = useState<State>({ status: 'loading', items: [], total: 0, fetching: true });
  const seq = useRef(0); // newest request wins; answers for older filters or pages are dropped
  const clamp = useRef(onOutOfRange);
  clamp.current = onOutOfRange;

  const load = useCallback(async (quiet: boolean) => {
    const f: RunFilters = JSON.parse(key), mine = ++seq.current;
    if (!quiet) setState(s => ({ ...s, status: s.status === 'ready' ? 'ready' : 'loading', fetching: true }));
    try {
      const page = await admin.runs({ status: f.status, operation: f.operation, model: f.model, since: sinceFor(f.range), page: f.page, page_size: RUN_PAGE_SIZE });
      if (mine !== seq.current) return;
      if (page.page !== f.page) { clamp.current(page.page); return; } // the server clamps an out-of-range page; follow it in the URL
      setState({ status: 'ready', items: page.items, total: page.total, fetching: false });
    } catch {
      if (mine === seq.current && !quiet) setState(s => ({ ...s, status: 'error', fetching: false }));
    }
  }, [key]);

  useEffect(() => { void load(false); }, [load]);

  const live = state.items.some(r => LIVE.has(r.status));
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => void load(true), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [live, load]);

  /** Swaps one row in place after an action returned its new state. */
  const patch = useCallback((run: AdminRunItem) => setState(s => ({ ...s, items: s.items.map(r => (r.id === run.id ? run : r)) })), []);

  return { ...state, live, reload: () => load(false), refresh: () => load(true), patch };
}
