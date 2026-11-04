import { useCallback, useEffect, useState } from 'react';
import { admin } from '../../../lib/api';
import type { AdminOverview, AdminPrefs, AdminRange } from '../../../lib/api-types';
import { rangeRefreshMs } from '../ui';

export const WIDGET_ORDER = ['trend', 'attention', 'weekday', 'speed', 'tasks', 'activity', 'models'] as const;
export type WidgetId = (typeof WIDGET_ORDER)[number];
export const DEFAULT_PREFS: AdminPrefs = { widgets: ['trend', 'attention', 'weekday', 'speed', 'tasks'] };

/** The overview of one range, refreshed in the background (10 s up to 15 minutes, 30 s beyond). A failed refresh keeps the last data. */
export function useOverview(range: AdminRange) {
  const [state, setState] = useState<{ range: AdminRange; data?: AdminOverview; failed?: boolean }>({ range });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => admin.overview(range).then(
      data => { if (live) setState({ range, data }); },
      () => { if (live) setState(s => (s.range === range && s.data ? s : { range, failed: true })); });
    setState({ range });
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, rangeRefreshMs(range));
    return () => { live = false; window.clearInterval(timer); };
  }, [range, attempt]);
  const current = state.range === range ? state : { range };
  return { data: current.data, failed: current.failed === true, retry: useCallback(() => setAttempt(n => n + 1), []) };
}

const valid = (p: unknown): p is AdminPrefs => !!p && Array.isArray((p as AdminPrefs).widgets);

/** Widget choice of this admin. Falls back to the defaults when the server does not answer. */
export function usePrefs() {
  const [prefs, setPrefs] = useState<AdminPrefs | null>(null);
  useEffect(() => {
    let live = true;
    admin.getPrefs().then(p => { if (live) setPrefs(valid(p) ? p : DEFAULT_PREFS); }, () => { if (live) setPrefs(DEFAULT_PREFS); });
    return () => { live = false; };
  }, []);
  /** Saves at once and puts the old choice back when the server refuses. Resolves false on failure. */
  const setWidgets = useCallback(async (widgets: string[]) => {
    if (!prefs) return true;
    const before = prefs;
    setPrefs({ ...before, widgets });
    try {
      const saved = await admin.savePrefs({ ...before, widgets });
      if (valid(saved)) setPrefs(saved);
      return true;
    } catch {
      setPrefs(before);
      return false;
    }
  }, [prefs]);
  return { prefs, setWidgets };
}
