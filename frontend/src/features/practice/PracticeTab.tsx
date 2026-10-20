// Session tab "ซ้อมสัมภาษณ์" (CR-IVP-01): the preparation list from the evaluation and the session's practice sets.
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BusyNote } from '@/components/BusyNote';
import { apiRequest } from '@/lib/api';
import { ApiError, type Locale, type PracticeLevel, type PracticeSection, type PracticeSet } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import { sendJson, useResource } from '../projects/useResource';
import { ReportListCard } from '../chat/EvaluationReportView';
import { SECTION_ORDER, practiceCopy, type PracticeCopy } from './copy';

const DEFAULTS: Partial<Record<PracticeSection, number>> = { intro: 2, behavioral: 3, technical: 4, gaps: 2 };

export function PracticeTab({ projectId, sessionId, locale, prep }: { projectId: string; sessionId: string; locale: Locale; prep?: string[] }) {
  const c = practiceCopy[locale];
  const api = `/projects/${projectId}/sessions/${sessionId}/practice-sets`;
  const sets = useResource<PracticeSet[]>(api);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<PracticeSet | null>(null);
  const [removed, setRemoved] = useState<PracticeSet | null>(null);
  const [failure, setFailure] = useState('');
  const list = sets.data ?? [];
  const reload = sets.reload;
  const generating = list.some(set => set.status === 'generating');
  useEffect(() => { if (!generating) return; const timer = window.setInterval(reload, 3000); return () => window.clearInterval(timer); }, [generating, reload]);
  const setPath = (id: string) => `/projects/${projectId}/practice-sets/${id}`;
  const act = async (fn: () => Promise<unknown>) => { setFailure(''); try { await fn(); reload(); } catch { setFailure(c.failedAction); } };

  return <div className="grid gap-4">
    <section aria-labelledby={`${sessionId}-practice`} className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid max-w-2xl gap-1"><h2 id={`${sessionId}-practice`} className="text-lg font-semibold">{c.title}</h2><p className="text-sm text-muted-foreground">{c.intro}</p></div>
        {list.length > 0 && <Button type="button" className="min-h-11" onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden="true" />{c.newSet}</Button>}
      </div>
      {removed && <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-background px-4 py-2.5 text-sm">
        <Trash2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 basis-[calc(100%-2rem)] break-words sm:basis-auto">{c.deleted(removed.name)}</span>
        <Button type="button" variant="ghost" size="sm" className="max-sm:ml-4" onClick={() => void act(async () => { await apiRequest(`${setPath(removed.id)}/restore`, { method: 'POST' }); setRemoved(null); })}>{c.undo}</Button>
        <Button type="button" variant="ghost" size="icon" className="max-sm:ml-auto" aria-label={c.dismiss} onClick={() => setRemoved(null)}><X className="size-4" aria-hidden="true" /></Button>
      </div>}
      {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
      {sets.status === 'loading' && !sets.data ? <BusyNote label="…" /> : list.length === 0 ? <div className="grid justify-items-start gap-3 rounded-lg border border-dashed p-5">
        <h3 className="font-semibold">{c.emptyTitle}</h3><p className="max-w-xl text-sm text-muted-foreground">{c.emptyBody}</p>
        <Button type="button" className="min-h-11" onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden="true" />{c.newSet}</Button>
      </div> : <ul className="grid divide-y rounded-lg border">{list.map(set => <li key={set.id} className="grid min-w-0 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="grid min-w-0 gap-1.5">
          <Link to={`/app/projects/${projectId}/sessions/${sessionId}/practice/${set.id}`} className="w-fit break-words font-semibold text-foreground hover:text-primary hover:underline [overflow-wrap:anywhere]">{set.name}</Link>
          <p className="text-sm text-muted-foreground">{c.levels[set.level]} · {set.sections.map(s => c.sections[s.id]).join(', ')}</p>
          {set.status === 'generating' ? <BusyNote label={c.generating} /> : set.status === 'failed'
            ? <p className="flex flex-wrap items-center gap-2 text-sm text-destructive">{c.failed}<Button type="button" size="sm" variant="outline" onClick={() => void act(() => apiRequest(`${setPath(set.id)}/retry`, { method: 'POST' }))}><RotateCcw className="size-4" aria-hidden="true" />{c.retry}</Button></p>
            : <Progress value={set.ready_count + set.known_count} max={set.question_count} label={c.progress(set.ready_count + set.known_count, set.question_count)} />}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" aria-label={c.options(set.name)} className="grid size-11 place-items-center justify-self-end rounded-md border bg-card text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><MoreHorizontal className="size-4" aria-hidden="true" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(set)}><Pencil className="size-4" aria-hidden="true" />{c.rename}</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive data-[highlighted]:text-destructive" onSelect={() => void act(async () => { await apiRequest(setPath(set.id), { method: 'DELETE' }); setRemoved(set); })}><Trash2 className="size-4" aria-hidden="true" />{c.del}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>)}</ul>}
    </section>
    <ReportListCard kind="interview" title={c.prepTitle} hint={c.prepHint} items={prep} />
    {creating && <CreateDialog c={c} api={api} projectId={projectId} sessionId={sessionId} locale={locale} defaultName={c.defaultName(list.length + 1)} onClose={() => setCreating(false)} />}
    {renaming && <RenameDialog c={c} set={renaming} path={setPath(renaming.id)} onClose={() => setRenaming(null)} onDone={() => { setRenaming(null); reload(); }} />}
  </div>;
}

export function Progress({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  return <div className={cn('flex items-center gap-3 text-sm text-muted-foreground', className)}>
    <span className="h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-secondary" aria-hidden="true"><span className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${max ? (100 * value) / max : 0}%` }} /></span>
    <span className="tabular-nums">{label}</span>
  </div>;
}

function CreateDialog({ c, api, projectId, sessionId, locale, defaultName, onClose }: { c: PracticeCopy; api: string; projectId: string; sessionId: string; locale: Locale; defaultName: string; onClose: () => void }) {
  const navigate = useNavigate();
  const id = useId();
  const [name, setName] = useState(defaultName);
  const [level, setLevel] = useState<PracticeLevel>('mid');
  const [counts, setCounts] = useState<Partial<Record<PracticeSection, number>>>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = SECTION_ORDER.filter(s => counts[s]);
  const total = chosen.reduce((n, s) => n + (counts[s] ?? 0), 0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen.length || total > 30) return;
    setBusy(true); setError('');
    try {
      const set = await sendJson<PracticeSet>(api, 'POST', { name: name.trim() || defaultName, level, output_language: locale, sections: chosen.map(s => ({ id: s, count: counts[s] })) });
      navigate(`/app/projects/${projectId}/sessions/${sessionId}/practice/${set.id}`);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : '';
      setError(code === 'quota_exceeded' ? c.quotaUsed : code === 'practice_set_limit' ? c.limit : c.failedAction);
      setBusy(false);
    }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <form className="grid gap-5" onSubmit={event => void submit(event)}>
        <div className="grid gap-1"><DialogTitle>{c.newSet}</DialogTitle><DialogDescription>{c.intro}</DialogDescription></div>
        <div className="grid gap-2"><Label htmlFor={`${id}-name`}>{c.name}</Label><Input id={`${id}-name`} value={name} maxLength={120} onChange={event => setName(event.target.value)} /></div>
        <fieldset className="grid gap-2"><legend className="mb-2 text-sm font-medium">{c.level}</legend>
          <div className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1">{(['entry', 'mid', 'senior'] as const).map(value => <label key={value} className="relative flex-1">
            <input type="radio" name={`${id}-level`} value={value} checked={level === value} onChange={() => setLevel(value)} className="peer absolute inset-0 z-10 cursor-pointer opacity-0" />
            <span className="flex min-h-10 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring">{c.levels[value]}</span>
          </label>)}</div>
        </fieldset>
        <fieldset className="grid gap-2"><legend className="mb-2 text-sm font-medium">{c.sectionsLegend}</legend>
          <ul className="grid divide-y rounded-lg border">{SECTION_ORDER.map(section => {
            const on = Boolean(counts[section]);
            return <li key={section} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
              <input id={`${id}-${section}`} type="checkbox" className="size-4 accent-[var(--primary)]" checked={on} aria-describedby={`${id}-${section}-hint`}
                onChange={event => setCounts(current => ({ ...current, [section]: event.target.checked ? DEFAULTS[section] ?? 2 : 0 }))} />
              <label htmlFor={`${id}-${section}`} className="grid min-w-0 cursor-pointer gap-0.5"><span className="text-sm font-medium">{c.sections[section]}</span><span id={`${id}-${section}-hint`} className="text-xs text-muted-foreground">{c.sectionHints[section]}</span></label>
              <input type="number" min={1} max={6} disabled={!on} aria-label={c.countLabel(c.sections[section])} value={on ? counts[section] : ''}
                onChange={event => setCounts(current => ({ ...current, [section]: Math.min(6, Math.max(1, Number(event.target.value) || 1)) }))}
                className="h-10 w-16 rounded-md border border-input bg-card px-2 text-center text-sm tabular-nums disabled:opacity-40" />
            </li>;
          })}</ul>
          <p className={cn('text-sm tabular-nums', total > 30 ? 'text-destructive' : 'text-muted-foreground')}>{total > 30 ? c.tooMany : c.total(total)}</p>
        </fieldset>
        <p className="text-xs text-muted-foreground">{c.quotaNote}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><DialogClose asChild><Button type="button" variant="outline" disabled={busy}>{c.cancel}</Button></DialogClose><Button type="submit" busy={busy} disabled={busy || !chosen.length || total > 30}>{c.createSet}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function RenameDialog({ c, set, path, onClose, onDone }: { c: PracticeCopy; set: { name: string }; path: string; onClose: () => void; onDone: (name: string) => void }) {
  const id = useId();
  const [name, setName] = useState(set.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await sendJson(path, 'PATCH', { name: name.trim() }); onDone(name.trim()); } catch { setError(c.failedAction); setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent><form className="grid gap-4" onSubmit={event => void submit(event)}>
      <DialogTitle>{c.renameTitle}</DialogTitle>
      <div className="grid gap-2"><Label htmlFor={`${id}-name`}>{c.name}</Label><Input id={`${id}-name`} value={name} maxLength={120} onChange={event => setName(event.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="outline">{c.cancel}</Button></DialogClose><Button type="submit" busy={busy} disabled={busy || !name.trim()}>{c.save}</Button></div>
    </form></DialogContent>
  </Dialog>;
}
