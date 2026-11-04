import { useCallback, useEffect, useRef, useState } from 'react';
import { admin } from '../../../lib/api';
import type { AdminRunItem, AdminRunStatus } from '../../../lib/api-types';
import { LIVE, sinceFor } from './format';

export type RunFilters = { status?: AdminRunStatus; operation?: string; model?: string; range: string };
type State = { status: 'loading' | 'ready' | 'error'; items: AdminRunItem[]; next: string | null; more: 'idle' | 'loading' | 'error' };

const REFRESH_MS = 10_000;

/** Runs list for one filter set: first page, "load more" pages, and a quiet 10 s refresh while a visible run is queued or running. */
export function useRunList(filters: RunFilters) {
  const key = JSON.stringify(filters);
  const [state, setState] = useState<State>({ status: 'loading', items: [], next: null, more: 'idle' });
  const gen = useRef(0); // bumps when the filters change, so answers for old filters are dropped
  const seq = useRef(0); // newest first-page request wins
  const deep = useRef(false); // true once "load more" ran, so a refresh must not drop the extra pages
  const query = useCallback((cursor?: string) => {
    const f: RunFilters = JSON.parse(key);
    return admin.runs({ status: f.status, operation: f.operation, model: f.model, since: sinceFor(f.range), cursor });
  }, [key]);

  const load = useCallback(async (quiet: boolean) => {
    const mine = gen.current, mySeq = ++seq.current;
    if (!quiet) { deep.current = false; setState({ status: 'loading', items: [], next: null, more: 'idle' }); }
    try {
      const page = await query();
      if (mine !== gen.current || mySeq !== seq.current) return;
      setState(s => {
        if (!deep.current) return { status: 'ready', items: page.items, next: page.next_cursor, more: 'idle' };
        const fresh = new Map(page.items.map(r => [r.id, r]));
        const known = new Set(s.items.map(r => r.id));
        return { ...s, status: 'ready', items: [...page.items.filter(r => !known.has(r.id)), ...s.items.map(r => fresh.get(r.id) ?? r)] };
      });
    } catch {
      if (mine === gen.current && mySeq === seq.current && !quiet) setState(s => ({ ...s, status: 'error' }));
    }
  }, [query]);

  useEffect(() => { gen.current++; void load(false); }, [load]);

  const live = state.items.some(r => LIVE.has(r.status));
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => void load(true), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [live, load]);

  const loadMore = useCallback(async () => {
    if (!state.next) return;
    const mine = gen.current;
    setState(s => ({ ...s, more: 'loading' }));
    try {
      const page = await query(state.next);
      if (mine !== gen.current) return;
      deep.current = true;
      setState(s => ({ ...s, items: [...s.items, ...page.items.filter(r => !s.items.some(o => o.id === r.id))], next: page.next_cursor, more: 'idle' }));
    } catch { if (mine === gen.current) setState(s => ({ ...s, more: 'error' })); }
  }, [query, state.next]);

  /** Swaps one row in place after an action returned its new state. */
  const patch = useCallback((run: AdminRunItem) => setState(s => ({ ...s, items: s.items.map(r => (r.id === run.id ? run : r)) })), []);

  return { ...state, live, reload: () => load(false), refresh: () => load(true), loadMore, patch };
}
