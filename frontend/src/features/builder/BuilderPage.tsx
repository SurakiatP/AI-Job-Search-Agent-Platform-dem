import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Link, useParams } from 'react-router';
import { PageBack } from '@/components/PageBack';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { apiRequest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';
import { sendJson } from '../projects/useResource';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select } from '../../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { BusyNote } from '../../components/BusyNote';
import { ACCENTS, FIELDS, PERSONAL_KEYS, emptyItem, mergeResume, normalize, type Draft, type Field, type Item, type Lang, type ListSection, type ResumeData, type SectionName } from './sections';
import { ThemePanel } from '../themes/ThemePanel';
import { isCustom, type Working } from '../themes/themes';
import { useResource } from '../projects/useResource';
import { copy } from './copy';
import { PhotoField } from './PhotoField';
import { ImportExperience } from './ImportExperience';
import { AiLabel } from '@/components/AiMark';
import { dateLocale } from '../../lib/locale';

type Kind = 'cv' | 'document';
type SaveResult = 'saved' | 'dirty' | 'draft_conflict' | 'resume_invalid' | 'offline';
type SaveState = 'saved' | 'saving' | 'dirty' | 'offline' | 'conflict' | 'invalid';
// Save shortly after typing stops; preview right after each save, at most once per PREVIEW_GAP_MS
// (the server allows 20 previews a minute).
const SAVE_DELAY_MS = 400;
const PREVIEW_GAP_MS = 3000;
type Province = { id: string; en: string; th: string };
const pageCount = async (blob: Blob) => Math.max(1, ((await blob.text()).match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length);

export function BuilderPage({ kind }: { kind: Kind }) {
  const { projectId = '', cvId = '', documentId = '' } = useParams();
  const ownerId = kind === 'cv' ? cvId : documentId;
  const base = `/projects/${projectId}/${kind === 'cv' ? 'cvs' : 'documents'}/${ownerId}/draft`;
  const stashKey = `cvb-draft:${kind}:${ownerId}`;
  const { locale } = useLocale();
  const c = copy[locale];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [save, setSave] = useState<SaveState>('saved');
  const [invalidPath, setInvalidPath] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [confirm, setConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<number | null>(null);
  const [publishError, setPublishError] = useState('');
  const [stash, setStash] = useState<Draft | null>(null);
  const latest = useRef<Draft | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const previewTimer = useRef<number | undefined>(undefined);
  const flight = useRef<Promise<unknown> | null>(null); // the save in progress, if any
  const pending = useRef(false); // edits not yet saved
  const mounted = useRef(true);
  const lastPreview = useRef(0);
  const previewBusy = useRef(false);
  const previewAgain = useRef(false);
  const working = useRef<Working | null>(null); // theme tokens being tried in the customiser, not saved yet
  const [pages, setPages] = useState(0);
  const [customising, setCustomising] = useState(false); // the customiser has its own colour row

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const value = await apiRequest<Draft>(base);
      const loaded = { ...value, resume_data: normalize(value.resume_data) };
      latest.current = loaded; setDraft(loaded); setSave('saved');
    } catch { setLoadError(true); return; }
    try {
      const kept = localStorage.getItem(stashKey);
      if (kept) { const old = JSON.parse(kept) as Draft; setStash({ ...old, resume_data: normalize(old.resume_data) }); }
    } catch { try { localStorage.removeItem(stashKey); } catch { /* storage blocked */ } }
  }, [base, stashKey]);
  useEffect(() => { void load(); }, [load]);

  const preview = useCallback(async () => {
    if (previewBusy.current) { previewAgain.current = true; return; }
    previewBusy.current = true; lastPreview.current = Date.now();
    setPreviewing(true); setPreviewError(false);
    try {
      const trying = working.current;
      const blob = await apiRequest<Blob>(trying ? `${base}/theme-preview` : `${base}/preview`, trying ? { method: 'POST', body: JSON.stringify(trying) } : { method: 'POST' });
      setPages(await pageCount(blob));
      setPdfUrl(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
    } catch { setPreviewError(true); }
    finally {
      previewBusy.current = false; setPreviewing(false);
      if (previewAgain.current) { previewAgain.current = false; void preview(); }
    }
  }, [base]);
  const schedulePreview = useCallback(() => {
    window.clearTimeout(previewTimer.current);
    const wait = Math.max(0, lastPreview.current + PREVIEW_GAP_MS - Date.now());
    previewTimer.current = window.setTimeout(() => void preview(), wait);
  }, [preview]);
  useEffect(() => { if (draft && !pdfUrl && !previewing && !previewError) void preview(); }, [draft, pdfUrl, previewing, previewError, preview]);
  const tryTheme = useCallback((next: Working | null) => { working.current = next; setCustomising(next !== null); schedulePreview(); }, [schedulePreview]);
  useEffect(() => () => { setPdfUrl(old => { if (old) URL.revokeObjectURL(old); return null; }); }, []);

  const persist = useCallback(async (): Promise<SaveResult> => {
    while (flight.current) await flight.current;
    const current = latest.current;
    if (!current) return 'offline';
    if (!pending.current) return 'saved';
    pending.current = false;
    const run = (async (): Promise<SaveResult> => {
      setSave('saving');
      try {
        const saved = await sendJson<Draft>(base, 'PUT', { resume_data: current.resume_data, template_id: current.template_id, accent: current.accent, document_language: current.document_language, updated_at: current.updated_at });
        const unchanged = latest.current === current;
        latest.current = { ...(unchanged ? saved : latest.current!), updated_at: saved.updated_at };
        setDraft(latest.current);
        try { localStorage.removeItem(stashKey); } catch { /* storage blocked */ }
        setSavedAt(new Date()); setSave(unchanged ? 'saved' : 'dirty');
        if (!unchanged) saveTimer.current = window.setTimeout(() => void persist(), 300);
        if (mounted.current) schedulePreview();
        return unchanged ? 'saved' : 'dirty';
      } catch (error) {
        pending.current = true;
        if (error instanceof ApiError && error.code === 'draft_conflict') { setSave('conflict'); return 'draft_conflict'; }
        if (error instanceof ApiError && error.code === 'resume_invalid') { setSave('invalid'); setInvalidPath(String(error.fields?.path ?? '')); return 'resume_invalid'; }
        setSave('offline');
        try { localStorage.setItem(stashKey, JSON.stringify(current)); } catch { /* storage full or blocked */ }
        return 'offline';
      }
    })();
    flight.current = run;
    try { return await run; } finally { flight.current = null; }
  }, [base, schedulePreview, stashKey]);
  const persistNow = useRef(persist);
  persistNow.current = persist;

  const change = useCallback((next: Draft) => {
    latest.current = next; pending.current = true; setDraft(next); setSave('dirty');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persist(), SAVE_DELAY_MS);
  }, [persist]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(saveTimer.current); window.clearTimeout(previewTimer.current);
      if (pending.current) void persistNow.current(); // leaving within the save delay must not drop the last edits
    };
  }, []);
  useEffect(() => {
    if (save === 'saved') return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [save]);

  const data = (fn: (d: ResumeData) => ResumeData) => { const d = latest.current; if (d) change({ ...d, resume_data: fn(structuredClone(d.resume_data)) }); };

  async function publish() {
    setPublishing(true); setPublishError('');
    try {
      window.clearTimeout(saveTimer.current);
      let result = await persist();
      if (result === 'dirty') result = await persist();
      if (result !== 'saved') { setPublishError(c.errors[result as keyof typeof c.errors] ?? c.errors.generic); return; }
      const revision = await apiRequest<{ revision: number }>(`${base}/publish`, { method: 'POST' });
      setPublished(revision.revision); setConfirm(false);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : '';
      setPublishError(c.errors[code as keyof typeof c.errors] ?? c.errors.generic);
    } finally { setPublishing(false); }
  }

  if (loadError) return <div className="grid gap-3 p-6"><p role="alert">{c.loadError}</p><Button className="w-fit" onClick={() => void load()}>{c.retry}</Button></div>;
  if (!draft) return <div className="p-6"><BusyNote locale={locale} label={c.loading} /></div>;
  const r = draft.resume_data;
  const back = kind === 'cv' ? `/app/projects/${projectId}/profile` : `/app/projects/${projectId}/documents/${documentId}`;

  const status = { saved: savedAt ? c.savedAt(savedAt.toLocaleTimeString(dateLocale(locale), { hour: '2-digit', minute: '2-digit' })) : c.saved,
    saving: c.saving, dirty: c.saving, offline: c.offline, conflict: c.conflict, invalid: c.invalid(invalidPath) }[save];

  // Same rule as the server's sample fill (services/resume.py with_sample): empty core parts that are not hidden show sample content.
  const sampled = [!r.basics.name && c.basics, !r.summary.content && !r.summary_hidden && c.sections.summary,
    ...(['experience', 'education', 'skills'] as const).filter(n => !r.sections[n].items.length && !r.sections[n].hidden).map(n => c.sections[n])].filter(Boolean) as string[];
  const previewPane = <section aria-label={c.preview} className="grid min-h-0 content-start gap-2">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{c.preview}{pages > 0 && <span className="ml-2 font-normal text-muted-foreground">· {c.pages(pages)}</span>}</h2>
      <Button size="sm" variant="outline" busy={previewing} onClick={() => void preview()}><RefreshCw className="size-4" aria-hidden="true" />{c.updatePreview}</Button>
    </div>
    {previewError && <Alert severity="warning" role="alert">{c.previewFailed}</Alert>}
    {sampled.length > 0 && <Alert severity="warning" role="note">
      <p className="font-semibold">{c.sampleTitle}</p>
      <p>{c.sampleBody}</p>
      <ul className="mt-2 flex flex-wrap gap-2">{sampled.map(s => <li key={s} className="rounded-md bg-warning/20 px-3 py-1 font-medium">{s}</li>)}</ul>
    </Alert>}
    {pages > 2 && <Alert severity="warning" role="note">{c.tooLong}</Alert>}
    <div className="rounded-xl bg-muted p-4 sm:p-6"><div className="relative overflow-hidden rounded-lg border bg-white shadow-md" style={{ aspectRatio: '1 / 1.414' }}>
      {pdfUrl ? <iframe title={c.preview} src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`} className="absolute -left-4 -top-1.5 h-[calc(100%+2.5rem)] w-[calc(100%+2rem)] max-w-none border-0" /> : <div className="grid size-full place-items-center p-4 text-sm text-muted-foreground">{c.loading}</div>}
      {previewing && pdfUrl && <div className="absolute right-2 top-2 rounded bg-primary-fill px-2 py-1 text-xs text-primary-fill-foreground">{c.rendering}</div>}
    </div></div>
  </section>;

  return <div className="grid gap-6 lg:gap-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="grid gap-1">
        <PageBack to={back}>{kind === 'cv' ? c.backCv : c.backDoc}</PageBack>
        <h1 className="text-2xl font-semibold">{kind === 'cv' ? c.title : c.titleDoc}</h1>
        <NameEditor key={draft.name ?? ''} c={c} label={kind === 'cv' ? c.cvName : c.docName} initial={draft.name ?? ''}
          url={kind === 'cv' ? `/projects/${projectId}/cvs/${ownerId}` : `/projects/${projectId}/documents/${ownerId}`}
          field={kind === 'cv' ? 'name' : 'title'} max={kind === 'cv' ? 120 : 300} />
        {kind === 'document' && <AiLabel check className="w-fit" />}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span role="status" className={`text-sm ${save === 'saved' ? 'text-muted-foreground' : save === 'saving' || save === 'dirty' ? 'text-muted-foreground' : 'text-destructive'}`}>{status}</span>
        <Button onClick={() => { setPublishError(''); setConfirm(true); }}>{c.publish}</Button>
      </div>
    </div>
    {save === 'conflict' && <Alert severity="warning" role="alert" action={<Button size="sm" variant="outline" onClick={() => void load()}>{c.reload}</Button>}>{c.conflictLong}</Alert>}
    {save === 'offline' && <Alert severity="warning" role="alert" action={<Button size="sm" variant="outline" onClick={() => void persist()}>{c.retry}</Button>}>{c.offlineLong}</Alert>}
    {stash && save === 'saved' && <Alert severity="info" action={<span className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setStash(null); localStorage.removeItem(stashKey); if (draft) change({ ...stash, updated_at: draft.updated_at }); }}>{c.restore}</Button>
      <Button size="sm" variant="ghost" onClick={() => { setStash(null); localStorage.removeItem(stashKey); }}>{c.discard}</Button></span>}>{c.stashFound}</Alert>}
    {published !== null && <Alert severity="success">{kind === 'cv' ? c.publishedCv(published) : c.publishedDoc(published)} <Link className="font-medium text-primary underline" to={back}>{c.open}</Link></Alert>}
    {kind === 'document' && <p className="rounded-lg border bg-muted/40 p-3 text-sm">{c.docNote}</p>}

    {kind === 'cv' && <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <ImportExperience projectId={projectId} base={base} locale={locale} onAdd={add => data(d => mergeResume(d, add))} />
      <p className="text-sm text-muted-foreground">{c.importHint}</p>
    </div>}

    <ThemePanel templateId={draft.template_id} accent={draft.accent} hasPhoto={!!r.basics.photo} locale={locale}
      onPick={id => change({ ...draft, template_id: id })} onWorking={tryTheme} />

    <div className="grid gap-3 rounded-xl border bg-card p-4 lg:grid-cols-[auto_1fr] lg:items-end">
      {!isCustom(draft.template_id) && !customising && <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-medium">{c.accent}</legend>
        <div className="flex flex-wrap gap-2">{ACCENTS.map(a => <button key={a.id} type="button" aria-label={c.accents[a.id]} aria-pressed={draft.accent === a.id} onClick={() => change({ ...draft, accent: a.id })}
          className="grid size-11 place-items-center rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-foreground"><span className="size-7 rounded-full" style={{ background: a.hex }} /></button>)}</div>
      </fieldset>}
      <div className="grid gap-2 lg:w-56"><Label htmlFor="cvb-lang">{c.docLanguage}</Label>
        <Select id="cvb-lang" value={draft.document_language} onChange={e => change({ ...draft, document_language: e.target.value as Lang })}>
          <option value="th">ไทย</option><option value="en">English</option></Select></div>
    </div>

    <div className="flex gap-2 lg:hidden">
      {(['edit', 'preview'] as const).map(t => <Button key={t} aria-pressed={tab === t} variant={tab === t ? 'default' : 'outline'} className="flex-1" onClick={() => setTab(t)}>{t === 'edit' ? c.edit : c.preview}</Button>)}
    </div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className={`grid content-start gap-3 ${tab === 'edit' ? '' : 'hidden lg:grid'}`}>
        <section className="grid gap-3 rounded-xl border bg-card p-4" aria-labelledby="cvb-basics">
          <h2 id="cvb-basics" className="font-semibold">{c.basics}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['name', 'headline', 'email', 'phone'] as const).map(key => <TextField key={key} id={`basics-${key}`} label={c.basicsFields[key]} value={r.basics[key]}
              onChange={value => data(d => { d.basics[key] = value; return d; })} required={key === 'name'} />)}
          </div>
          <PhotoField projectId={projectId} photoId={r.basics.photo ?? ''} c={c} onChange={id => data(d => { d.basics.photo = id; return d; })} />
          <AddressEditor c={c} locale={locale} data={r} update={data} />
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">{c.links}</h3>
            {r.basics.profiles.map((p, i) => <div key={p.id} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
              <TextField id={`profile-${p.id}-network`} label={c.network} value={p.network} onChange={v => data(d => { d.basics.profiles[i].network = v; return d; })} />
              <TextField id={`profile-${p.id}-url`} label={c.url} value={p.url} type="url" onChange={v => data(d => { d.basics.profiles[i].url = v; return d; })} />
              <Button variant="ghost" size="icon" aria-label={c.removeLink} onClick={() => data(d => { d.basics.profiles.splice(i, 1); return d; })}><Trash2 className="size-4" aria-hidden="true" /></Button>
            </div>)}
            {r.basics.profiles.length < 10 && <Button size="sm" variant="outline" className="w-fit" onClick={() => data(d => { d.basics.profiles.push({ id: crypto.randomUUID(), network: '', url: '' }); return d; })}><Plus className="size-4" aria-hidden="true" />{c.addLink}</Button>}
          </div>
        </section>
        {r.order.map((name, index) => <SectionEditor key={name} name={name} index={index} count={r.order.length} data={r} locale={locale} update={data} />)}
      </div>
      <div className={`lg:sticky lg:top-4 lg:self-start ${tab === 'preview' ? '' : 'hidden lg:block'}`}>{previewPane}</div>
    </div>

    <Dialog open={confirm} onOpenChange={setConfirm}>
      <DialogContent>
        <DialogTitle>{c.publishTitle}</DialogTitle>
        <DialogDescription>{kind === 'cv' ? c.publishBodyCv : c.publishBodyDoc}</DialogDescription>
        {publishError && <Alert severity="error">{publishError}</Alert>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirm(false)}>{c.cancel}</Button><Button busy={publishing} onClick={() => void publish()}>{c.publish}</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}

function TextField({ id, label, value, onChange, type = 'text', required = false, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return <div className="grid min-w-0 gap-2"><Label htmlFor={id}>{label}{required && <span aria-hidden="true" className="text-destructive"> *</span>}</Label>
    <Input id={id} type={type} value={value} required={required} placeholder={placeholder} maxLength={type === 'url' ? 500 : 200} onChange={e => onChange(e.target.value)} /></div>;
}

function SectionEditor({ name, index, count, data, locale, update }: { name: SectionName; index: number; count: number; data: ResumeData; locale: Lang; update: (fn: (d: ResumeData) => ResumeData) => void }) {
  const c = copy[locale];
  const hidden = name === 'summary' ? data.summary_hidden : name === 'personal' ? data.personal_hidden : data.sections[name].hidden;
  const move = (step: number) => update(d => { const o = d.order; [o[index], o[index + step]] = [o[index + step], o[index]]; return d; });
  const toggle = () => update(d => {
    if (name === 'summary') d.summary_hidden = !d.summary_hidden;
    else if (name === 'personal') d.personal_hidden = !d.personal_hidden;
    else d.sections[name].hidden = !d.sections[name].hidden;
    return d;
  });
  const filled = name === 'summary' ? Boolean(data.summary.content) : name === 'personal' ? PERSONAL_KEYS.some(k => data.personal[k]) : data.sections[name].items.length > 0;
  const [open, setOpen] = useState(filled || name === 'summary' || name === 'experience');
  const bodyId = useId();
  return <div className="rounded-xl border bg-card">
    <div className="flex min-h-12 items-center justify-between gap-2 px-4">
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(v => !v)} className="min-h-12 min-w-0 flex-1 rounded-md py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className={`font-semibold ${hidden ? 'text-muted-foreground line-through' : ''}`}>{c.sections[name]}{!filled && <span className="ml-2 text-xs font-normal text-muted-foreground">{c.empty}</span>}</span>
      </button>
      <span className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label={c.moveUp(c.sections[name])} disabled={index === 0} onClick={() => move(-1)}><ArrowUp className="size-4" aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" aria-label={c.moveDown(c.sections[name])} disabled={index === count - 1} onClick={() => move(1)}><ArrowDown className="size-4" aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" aria-pressed={hidden} aria-label={hidden ? c.show(c.sections[name]) : c.hide(c.sections[name])} onClick={toggle}>{hidden ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}</Button>
      </span>
    </div>
    <div id={bodyId} hidden={!open} className="grid gap-3 border-t px-4 py-3">
      {name === 'summary'
        ? <div className="grid gap-2"><Label htmlFor="cvb-summary">{c.sections.summary}</Label>
          <Textarea id="cvb-summary" rows={4} maxLength={1000} value={data.summary.content} placeholder={c.summaryPlaceholder} onChange={e => update(d => { d.summary.content = e.target.value; return d; })} /></div>
        : name === 'personal' ? <PersonalEditor c={c} data={data} update={update} />
        : <ItemsEditor name={name} data={data} locale={locale} update={update} />}
    </div>
  </div>;
}

function ItemsEditor({ name, data, locale, update }: { name: ListSection; data: ResumeData; locale: Lang; update: (fn: (d: ResumeData) => ResumeData) => void }) {
  const c = copy[locale];
  const items = data.sections[name].items;
  return <>
    {name === 'references' && <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm">
      <p>{c.referencesNote}</p>
      <label className="flex min-h-11 lg:min-h-10 items-center gap-2"><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={data.references_on_request} onChange={e => update(d => { d.references_on_request = e.target.checked; return d; })} />{c.onRequest}</label>
    </div>}
    {items.map((item, i) => <fieldset key={item.id} className="grid gap-3 rounded-lg border p-3">
      <legend className="sr-only">{c.itemLabel(c.sections[name], i + 1)}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS[name].map(field => <FieldInput key={field.key} field={field} item={item} locale={locale} prefix={`${name}-${item.id}`}
          onChange={value => update(d => { d.sections[name].items[i][field.key] = value; return d; })} />)}
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => update(d => { const a = d.sections[name].items; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return d; })}><ArrowUp className="size-4" aria-hidden="true" />{c.up}</Button>
        <Button size="sm" variant="ghost" disabled={i === items.length - 1} onClick={() => update(d => { const a = d.sections[name].items; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return d; })}><ArrowDown className="size-4" aria-hidden="true" />{c.down}</Button>
        <Button size="sm" variant="ghost" onClick={() => update(d => { d.sections[name].items.splice(i, 1); return d; })}><Trash2 className="size-4" aria-hidden="true" />{c.remove}</Button>
      </div>
    </fieldset>)}
    {items.length < 50 && <Button size="sm" variant="outline" className="w-fit" onClick={() => update(d => { d.sections[name].items.push(emptyItem(name)); return d; })}><Plus className="size-4" aria-hidden="true" />{c.add(c.sections[name])}</Button>}
  </>;
}

function FieldInput({ field, item, locale, prefix, onChange }: { field: Field; item: Item; locale: Lang; prefix: string; onChange: (value: unknown) => void }) {
  const id = `${prefix}-${field.key}`;
  const label = field[locale];
  const placeholder = field.placeholder?.[locale];
  const value = item[field.key];
  if (field.kind === 'bool') return <label className="flex min-h-11 lg:min-h-10 items-center gap-2 text-sm sm:self-end"><input id={id} type="checkbox" className="size-5 shrink-0 accent-primary" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />{label}</label>;
  if (field.kind === 'lines' || field.kind === 'textarea') {
    const text = field.kind === 'lines' ? ((value as string[]) ?? []).join('\n') : String(value ?? '');
    return <div className="grid gap-2 sm:col-span-2"><Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={field.kind === 'lines' ? 4 : 3} value={text} placeholder={placeholder}
        onChange={e => onChange(field.kind === 'lines' ? e.target.value.split('\n').slice(0, 20) : e.target.value)} /></div>;
  }
  if (field.kind === 'keywords') return <KeywordsInput id={id} label={label} value={(value as string[]) ?? []} onChange={onChange} />;
  return <TextField id={id} label={label} value={String(value ?? '')} placeholder={placeholder} type={field.kind === 'month' ? 'month' : field.kind === 'url' ? 'url' : 'text'} onChange={onChange} />;
}

const parseKeywords = (text: string) => text.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
/** Keeps the raw text so a comma can be typed and deleted; the list is parsed from it. */
function KeywordsInput({ id, label, value, onChange }: { id: string; label: string; value: string[]; onChange: (value: unknown) => void }) {
  const [raw, setRaw] = useState(value.join(', '));
  if (parseKeywords(raw).join('\u0000') !== value.join('\u0000')) setRaw(value.join(', ')); // changed from outside (restore, import)
  return <TextField id={id} label={label} value={raw} onChange={v => { setRaw(v); onChange(parseKeywords(v)); }} />;
}

type Copy = (typeof copy)['en'];
type Update = (fn: (d: ResumeData) => ResumeData) => void;

/** CV or tailored-document name under the page title: click to edit, Enter or leaving the field saves, Esc cancels. */
function NameEditor({ c, label, initial, url, field, max }: { c: Copy; label: string; initial: string; url: string; field: 'name' | 'title'; max: number }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [failed, setFailed] = useState(false);
  const skip = useRef(false);
  const sending = useRef<string | null>(null);
  async function commit() {
    if (skip.current) { skip.current = false; return; }
    const next = value.trim();
    if (!next || next === saved) { setValue(saved); return; }
    if (sending.current === next) return;
    sending.current = next;
    try { await sendJson(url, 'PATCH', { [field]: next }); setSaved(next); setValue(next); setFailed(false); }
    catch { setFailed(true); } finally { sending.current = null; }
  }
  return <div className="grid gap-1">
    <label htmlFor="cvb-name" className="sr-only">{label}</label>
    <input id="cvb-name" value={value} maxLength={max} onChange={e => setValue(e.target.value)} onBlur={() => void commit()}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { skip.current = true; setValue(saved); e.currentTarget.blur(); }
      }}
      /* optical: the input padding is pulled back so the text lines up with the title above */ className="-mx-1 w-full max-w-md min-h-11 rounded-md border border-transparent bg-transparent px-1 py-1 text-base text-muted-foreground lg:min-h-10 hover:border-input focus-visible:border-input focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    {failed && <Alert severity="error">{c.renameFailed}</Alert>}
  </div>;
}

function AddressEditor({ c, locale, data, update }: { c: Copy; locale: Lang; data: ResumeData; update: Update }) {
  const provinces = useResource<{ provinces: Province[] }>('/resume-templates').data?.provinces ?? [];
  const a = data.basics.address;
  const set = (key: keyof typeof a, value: string) => update(d => { d.basics.address[key] = value; return d; });
  const sorted = [...provinces].sort((x, y) => x[locale].localeCompare(y[locale], locale));
  return <fieldset className="grid gap-3">
    <legend className="mb-1 text-sm font-medium">{c.address}</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><TextField id="address-line" label={c.addressFields.line} value={a.line} onChange={v => set('line', v)} /></div>
      <TextField id="address-subdistrict" label={c.addressFields.subdistrict} value={a.subdistrict} onChange={v => set('subdistrict', v)} />
      <TextField id="address-district" label={c.addressFields.district} value={a.district} onChange={v => set('district', v)} />
      <div className="grid min-w-0 gap-2"><Label htmlFor="address-province">{c.addressFields.province}</Label>
        <Select id="address-province" value={a.province} onChange={e => set('province', e.target.value)}>
          <option value="">{c.chooseProvince}</option>{sorted.map(p => <option key={p.id} value={p.id}>{p[locale]}</option>)}
        </Select></div>
      <div className="grid min-w-0 gap-2"><Label htmlFor="address-postcode">{c.addressFields.postcode}</Label>
        <Input id="address-postcode" inputMode="numeric" autoComplete="postal-code" value={a.postcode} onChange={e => set('postcode', e.target.value.replace(/\D/g, '').slice(0, 5))} /></div>
    </div>
    <label className="flex min-h-11 lg:min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={data.basics.address_full}
      onChange={e => update(d => { d.basics.address_full = e.target.checked; return d; })} />{c.addressFull}</label>
    <p className="text-xs text-muted-foreground">{c.addressNote}</p>
  </fieldset>;
}

function PersonalEditor({ c, data, update }: { c: Copy; data: ResumeData; update: Update }) {
  return <>
    <p className="rounded-lg bg-muted/40 p-3 text-sm">{c.personalNote}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {PERSONAL_KEYS.map(key => <TextField key={key} id={`personal-${key}`} label={c.personalFields[key]} value={data.personal[key]}
        placeholder={c.personalPlaceholders[key]} onChange={v => update(d => { d.personal[key] = v; return d; })} />)}
    </div>
  </>;
}
