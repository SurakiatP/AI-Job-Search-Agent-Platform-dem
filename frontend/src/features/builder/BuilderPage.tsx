import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { apiRequest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';
import { sendJson } from '../projects/useResource';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { BusyNote } from '../../components/BusyNote';
import { ACCENTS, FIELDS, emptyItem, type Draft, type Field, type Item, type Lang, type ResumeData, type SectionName, type TemplateId } from './sections';
import { copy } from './copy';

type Kind = 'cv' | 'document';
type SaveState = 'saved' | 'saving' | 'dirty' | 'offline' | 'conflict' | 'invalid';
const TEMPLATES: TemplateId[] = ['onyx', 'kakuna', 'ditgar'];

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
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const value = await apiRequest<Draft>(base);
      latest.current = value; setDraft(value); setSave('saved');
      const kept = localStorage.getItem(stashKey);
      if (kept) setStash(JSON.parse(kept) as Draft);
    } catch { setLoadError(true); }
  }, [base, stashKey]);
  useEffect(() => { void load(); }, [load]);

  const preview = useCallback(async () => {
    setPreviewing(true); setPreviewError(false);
    try {
      const blob = await apiRequest<Blob>(`${base}/preview`, { method: 'POST' });
      setPdfUrl(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
    } catch { setPreviewError(true); }
    finally { setPreviewing(false); }
  }, [base]);
  useEffect(() => { if (draft && !pdfUrl && !previewing && !previewError) void preview(); }, [draft, pdfUrl, previewing, previewError, preview]);
  useEffect(() => () => { setPdfUrl(old => { if (old) URL.revokeObjectURL(old); return null; }); }, []);

  const persist = useCallback(async () => {
    const current = latest.current;
    if (!current || inFlight.current) return;
    inFlight.current = true; setSave('saving');
    try {
      const saved = await sendJson<Draft>(base, 'PUT', { resume_data: current.resume_data, template_id: current.template_id, accent: current.accent, document_language: current.document_language, updated_at: current.updated_at });
      const unchanged = latest.current === current;
      latest.current = { ...(unchanged ? saved : latest.current!), updated_at: saved.updated_at };
      setDraft(latest.current);
      localStorage.removeItem(stashKey);
      setSavedAt(new Date()); setSave(unchanged ? 'saved' : 'dirty');
      if (!unchanged) saveTimer.current = window.setTimeout(() => void persist(), 300);
      window.clearTimeout(previewTimer.current);
      previewTimer.current = window.setTimeout(() => void preview(), 1000);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'draft_conflict') setSave('conflict');
      else if (error instanceof ApiError && error.code === 'resume_invalid') { setSave('invalid'); setInvalidPath(String(error.fields?.path ?? '')); }
      else { setSave('offline'); localStorage.setItem(stashKey, JSON.stringify(current)); }
    } finally { inFlight.current = false; }
  }, [base, preview, stashKey]);

  const change = useCallback((next: Draft) => {
    latest.current = next; setDraft(next); setSave('dirty');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persist(), 1000);
  }, [persist]);
  useEffect(() => () => { window.clearTimeout(saveTimer.current); window.clearTimeout(previewTimer.current); }, []);

  const data = (fn: (d: ResumeData) => ResumeData) => draft && change({ ...draft, resume_data: fn(structuredClone(draft.resume_data)) });

  async function publish() {
    setPublishing(true); setPublishError('');
    try {
      window.clearTimeout(saveTimer.current);
      if (save !== 'saved') await persist();
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

  const status = { saved: savedAt ? c.savedAt(savedAt.toLocaleTimeString(locale === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit' })) : c.saved,
    saving: c.saving, dirty: c.saving, offline: c.offline, conflict: c.conflict, invalid: c.invalid(invalidPath) }[save];

  const previewPane = <section aria-label={c.preview} className="grid min-h-0 content-start gap-2">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{c.preview}</h2>
      <Button size="sm" variant="outline" busy={previewing} onClick={() => void preview()}><RefreshCw className="size-4" aria-hidden="true" />{c.updatePreview}</Button>
    </div>
    {previewError && <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">{c.previewFailed}</p>}
    <div className="relative overflow-hidden rounded-lg border bg-white" style={{ aspectRatio: '1 / 1.414' }}>
      {pdfUrl ? <iframe title={c.preview} src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`} className="size-full border-0" /> : <div className="grid size-full place-items-center p-4 text-sm text-gray-600">{c.loading}</div>}
      {previewing && pdfUrl && <div className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white">{c.rendering}</div>}
    </div>
  </section>;

  return <div className="mx-auto grid w-full max-w-[1400px] gap-4 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="grid gap-1">
        <Link to={back} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />{kind === 'cv' ? c.backCv : c.backDoc}</Link>
        <h1 className="text-2xl font-semibold">{kind === 'cv' ? c.title : c.titleDoc}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span role="status" className={`text-sm ${save === 'saved' ? 'text-muted-foreground' : save === 'saving' || save === 'dirty' ? 'text-muted-foreground' : 'text-destructive'}`}>{status}</span>
        <Button onClick={() => { setPublishError(''); setConfirm(true); }}>{c.publish}</Button>
      </div>
    </div>
    {save === 'conflict' && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">{c.conflictLong}<Button size="sm" variant="outline" onClick={() => void load()}>{c.reload}</Button></div>}
    {save === 'offline' && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">{c.offlineLong}<Button size="sm" variant="outline" onClick={() => void persist()}>{c.retry}</Button></div>}
    {stash && save === 'saved' && <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">{c.stashFound}
      <Button size="sm" variant="outline" onClick={() => { setStash(null); localStorage.removeItem(stashKey); if (draft) change({ ...stash, updated_at: draft.updated_at }); }}>{c.restore}</Button>
      <Button size="sm" variant="ghost" onClick={() => { setStash(null); localStorage.removeItem(stashKey); }}>{c.discard}</Button></div>}
    {published !== null && <div role="status" className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm">{kind === 'cv' ? c.publishedCv(published) : c.publishedDoc(published)} <Link className="font-medium text-primary underline" to={back}>{c.open}</Link></div>}
    {kind === 'document' && <p className="rounded-lg border bg-muted/40 p-3 text-sm">{c.docNote}</p>}

    <div className="grid gap-3 rounded-xl border bg-card p-4 lg:grid-cols-[auto_auto_1fr] lg:items-end">
      <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-medium">{c.template}</legend>
        <div className="flex flex-wrap gap-2">{TEMPLATES.map(t => <Button key={t} size="sm" variant={draft.template_id === t ? 'default' : 'outline'} aria-pressed={draft.template_id === t} onClick={() => change({ ...draft, template_id: t })}>{c.templates[t]}</Button>)}</div>
      </fieldset>
      <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-medium">{c.accent}</legend>
        <div className="flex flex-wrap gap-2">{ACCENTS.map(a => <button key={a.id} type="button" aria-label={c.accents[a.id]} aria-pressed={draft.accent === a.id} onClick={() => change({ ...draft, accent: a.id })}
          className="grid size-11 place-items-center rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-foreground"><span className="size-7 rounded-full" style={{ background: a.hex }} /></button>)}</div>
      </fieldset>
      <div className="grid gap-2 lg:w-56"><Label htmlFor="cvb-lang">{c.docLanguage}</Label>
        <select id="cvb-lang" className="min-h-10 rounded-md border border-input bg-card px-3 text-sm" value={draft.document_language} onChange={e => change({ ...draft, document_language: e.target.value as Lang })}>
          <option value="th">ไทย</option><option value="en">English</option></select></div>
      {draft.template_id === 'ditgar' && <p className="flex items-start gap-2 text-sm text-muted-foreground lg:col-span-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />{c.atsWarning}</p>}
    </div>

    <div className="flex gap-2 lg:hidden" role="tablist">
      {(['edit', 'preview'] as const).map(t => <Button key={t} role="tab" aria-selected={tab === t} variant={tab === t ? 'default' : 'outline'} className="flex-1" onClick={() => setTab(t)}>{t === 'edit' ? c.edit : c.preview}</Button>)}
    </div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className={`grid content-start gap-3 ${tab === 'edit' ? '' : 'hidden lg:grid'}`}>
        <section className="grid gap-3 rounded-xl border bg-card p-4" aria-labelledby="cvb-basics">
          <h2 id="cvb-basics" className="font-semibold">{c.basics}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['name', 'headline', 'email', 'phone', 'location'] as const).map(key => <TextField key={key} id={`basics-${key}`} label={c.basicsFields[key]} value={r.basics[key]}
              onChange={value => data(d => { d.basics[key] = value; return d; })} required={key === 'name'} />)}
          </div>
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
        {publishError && <p role="alert" className="text-sm text-destructive">{publishError}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirm(false)}>{c.cancel}</Button><Button busy={publishing} onClick={() => void publish()}>{c.publish}</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}

function TextField({ id, label, value, onChange, type = 'text', required = false, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return <div className="grid min-w-0 gap-1.5"><Label htmlFor={id}>{label}{required && <span aria-hidden="true" className="text-destructive"> *</span>}</Label>
    <Input id={id} type={type} value={value} required={required} placeholder={placeholder} maxLength={type === 'url' ? 500 : 200} onChange={e => onChange(e.target.value)} /></div>;
}

function SectionEditor({ name, index, count, data, locale, update }: { name: SectionName; index: number; count: number; data: ResumeData; locale: Lang; update: (fn: (d: ResumeData) => ResumeData) => void }) {
  const c = copy[locale];
  const hidden = name === 'summary' ? data.summary_hidden : data.sections[name].hidden;
  const move = (step: number) => update(d => { const o = d.order; [o[index], o[index + step]] = [o[index + step], o[index]]; return d; });
  const toggle = () => update(d => { if (name === 'summary') d.summary_hidden = !d.summary_hidden; else d.sections[name].hidden = !d.sections[name].hidden; return d; });
  const filled = name === 'summary' ? Boolean(data.summary.content) : data.sections[name].items.length > 0;
  return <details className="group rounded-xl border bg-card" open={filled || name === 'summary' || name === 'experience'}>
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2">
      <span className={`font-semibold ${hidden ? 'text-muted-foreground line-through' : ''}`}>{c.sections[name]}{!filled && <span className="ml-2 text-xs font-normal text-muted-foreground">{c.empty}</span>}</span>
      <span className="flex items-center gap-1" onClick={e => e.preventDefault()}>
        <Button variant="ghost" size="icon" aria-label={c.moveUp(c.sections[name])} disabled={index === 0} onClick={() => move(-1)}><ArrowUp className="size-4" aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" aria-label={c.moveDown(c.sections[name])} disabled={index === count - 1} onClick={() => move(1)}><ArrowDown className="size-4" aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" aria-pressed={hidden} aria-label={hidden ? c.show(c.sections[name]) : c.hide(c.sections[name])} onClick={toggle}>{hidden ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}</Button>
      </span>
    </summary>
    <div className="grid gap-3 border-t px-4 py-3">
      {name === 'summary'
        ? <div className="grid gap-1.5"><Label htmlFor="cvb-summary">{c.sections.summary}</Label>
          <Textarea id="cvb-summary" rows={4} maxLength={1000} value={data.summary.content} placeholder={c.summaryPlaceholder} onChange={e => update(d => { d.summary.content = e.target.value; return d; })} /></div>
        : <ItemsEditor name={name} data={data} locale={locale} update={update} />}
    </div>
  </details>;
}

function ItemsEditor({ name, data, locale, update }: { name: Exclude<SectionName, 'summary'>; data: ResumeData; locale: Lang; update: (fn: (d: ResumeData) => ResumeData) => void }) {
  const c = copy[locale];
  const items = data.sections[name].items;
  return <>
    {name === 'references' && <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm">
      <p>{c.referencesNote}</p>
      <label className="flex min-h-10 items-center gap-2"><input type="checkbox" className="size-4 accent-primary" checked={data.references_on_request} onChange={e => update(d => { d.references_on_request = e.target.checked; return d; })} />{c.onRequest}</label>
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
  const c = copy[locale];
  const id = `${prefix}-${field.key}`;
  const label = field[locale];
  const placeholder = field.placeholder?.[locale];
  const value = item[field.key];
  if (field.kind === 'bool') return <label className="flex min-h-10 items-center gap-2 text-sm sm:self-end"><input id={id} type="checkbox" className="size-4 accent-primary" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />{label}</label>;
  if (field.kind === 'lines' || field.kind === 'textarea') {
    const text = field.kind === 'lines' ? ((value as string[]) ?? []).join('\n') : String(value ?? '');
    return <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={field.kind === 'lines' ? 4 : 3} value={text} placeholder={placeholder}
        onChange={e => onChange(field.kind === 'lines' ? e.target.value.split('\n').slice(0, 20) : e.target.value)} /></div>;
  }
  if (field.kind === 'level') return <div className="grid gap-1.5"><Label htmlFor={id}>{label}</Label>
    <select id={id} className="min-h-10 rounded-md border border-input bg-card px-3 text-sm" value={value == null ? '' : String(value)} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{c.noLevel}</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{c.level(n)}</option>)}</select></div>;
  if (field.kind === 'keywords') return <TextField id={id} label={label} value={((value as string[]) ?? []).join(', ')} onChange={v => onChange(v.split(',').map(s => s.trimStart()).slice(0, 20))} />;
  return <TextField id={id} label={label} value={String(value ?? '')} placeholder={placeholder} type={field.kind === 'month' ? 'month' : field.kind === 'url' ? 'url' : 'text'} onChange={onChange} />;
}
