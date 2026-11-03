// SPEC-RTH theme picker and builder: 1 choose a theme, 2 customise it with a live server preview, 3 save and share as a file.
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AlertTriangle, Check, Download, Palette, Trash2, Upload } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { apiRequest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';
import { sendJson, useResource } from '../projects/useResource';
import { ACCENTS } from '../builder/sections';
import { ThemeThumb } from './ThemeThumb';
import { themeCopy } from './copy';
import { copy as builderCopy } from '../builder/copy';
import { FILE_MAX_BYTES, LAYOUTS, accentOk, customId, type Custom, type Preset, type ThemeList, type Tokens, type Working } from './themes';

type Copy = (typeof themeCopy)['en'] | (typeof themeCopy)['th'];
type Edit = Working & { name: string };

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div role="group" aria-label={label} className="grid gap-2">
    <span className="text-sm font-medium">{label}</span>
    <div className="segmented flex-wrap">
      {options.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}
        className="min-h-11 rounded-md px-3 text-sm text-secondary-foreground transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">{text}</button>)}
    </div>
  </div>;
}

function Card({ id, name, layout, tokens, selected, c, ats, photo, onPick }: {
  id: string; name: string; layout: string; tokens: Tokens; selected: boolean; c: Copy; ats: boolean; photo: boolean; onPick: (id: string) => void;
}) {
  return <button type="button" aria-pressed={selected} onClick={() => onPick(id)}
    className="group grid gap-2 rounded-lg border bg-card p-2 text-left transition-colors hover:border-[color:var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary aria-pressed:focus-visible:ring-2 motion-reduce:transition-none">
    <span className="relative block aspect-[3/4] overflow-hidden rounded-sm border bg-white shadow-sm"><ThemeThumb layout={layout} tokens={tokens} />
      {selected && <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary-fill text-primary-fill-foreground"><Check className="size-3.5" aria-hidden="true" /></span>}
    </span>
    <span className="grid gap-0.5 px-1 pb-1"><span className="truncate text-sm font-medium">{name}</span>
      <span className="text-xs text-muted-foreground">{ats ? c.atsOk : c.atsNo}{photo ? ` · ${c.withPhoto}` : ''}</span></span>
  </button>;
}

export function ThemePanel({ templateId, accent, hasPhoto, locale, onPick, onWorking }: {
  templateId: string; accent: string; hasPhoto: boolean; locale: 'th' | 'en'; onPick: (id: string) => void; onWorking: (w: Working | null) => void;
}) {
  const c = themeCopy[locale];
  const bc = builderCopy[locale];
  const list = useResource<ThemeList>('/resume-themes');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [nameMissing, setNameMissing] = useState(false);

  if (list.status === 'loading' && !list.data) return <p className="text-sm text-muted-foreground" role="status">{c.loading}</p>;
  if (!list.data) return <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">{c.loadFailed}<Button size="sm" variant="outline" onClick={list.reload}>{c.retry}</Button></div>;
  const { presets, custom } = list.data;
  const preset = presets.find(p => p.id === templateId);
  const mine = custom.find(t => customId(t.id) === templateId);
  const chosen = preset ?? mine;
  const hexOfAccent = ACCENTS.find(a => a.id === accent)?.hex ?? ACCENTS[0].hex;
  const seed = (): Edit => preset
    ? { layout: preset.layout, name: '', tokens: { ...preset.tokens, accent: preset.id in LEGACY ? hexOfAccent : preset.tokens.accent } }
    : { layout: mine?.layout ?? 'onyx', name: '', tokens: mine?.tokens ?? { accent: hexOfAccent, font_pair: 'sans', size: 'normal', density: 'normal', heading_style: 'plain' } };

  const change = (next: Edit | null) => { setEdit(next); setNameMissing(false); onWorking(next ? { layout: next.layout, tokens: next.tokens } : null); };
  const token = <K extends keyof Tokens>(key: K, value: Tokens[K]) => edit && change({ ...edit, tokens: { ...edit.tokens, [key]: value } });
  const pick = (id: string) => { setNote(null); setConfirming(false); change(null); onPick(id); };

  const explain = (error: unknown, context: 'save' | 'import' = 'import'): string => {
    if (!(error instanceof ApiError)) return c.failed;
    if (error.code === 'theme_in_use') return c.inUse(String(error.fields?.used_by ?? '?'));
    if (error.code === 'theme_limit') return c.limit;
    if (error.code === 'duplicate') return c.taken;
    if (error.code === 'theme_invalid') {
      const rule = String(error.fields?.rule ?? '');
      if (context === 'import') return c.badFile(rule);
      return rule === 'name' ? c.needName : rule === 'tokens.accent' ? c.contrast : c.failed;
    }
    return c.failed;
  };
  async function run(action: () => Promise<void>, context: 'save' | 'import' = 'import') {
    setBusy(true); setNote(null);
    try { await action(); } catch (error) { setNote({ kind: 'error', text: explain(error, context) }); } finally { setBusy(false); }
  }
  const saveTheme = () => {
    if (edit && !edit.name.trim()) { flushSync(() => setNameMissing(true)); nameInput.current?.focus(); return; }
    return run(async () => {
    if (!edit) return;
    const saved = await sendJson<Custom>('/resume-themes', 'POST', { name: edit.name.trim(), layout: edit.layout, tokens: edit.tokens });
    list.reload(); change(null); onPick(customId(saved.id)); setNote({ kind: 'ok', text: c.saved });
    }, 'save');
  };
  const importFile = (picked: File | undefined) => {
    if (!picked) return;
    if (picked.size > FILE_MAX_BYTES) { setNote({ kind: 'error', text: c.fileTooBig }); return; }
    void run(async () => {
      const body = new FormData();
      body.set('file', picked, picked.name);
      const saved = await apiRequest<Custom>('/resume-themes/import', { method: 'POST', body });
      list.reload(); onPick(customId(saved.id)); setNote({ kind: 'ok', text: c.imported });
    });
  };
  const remove = () => run(async () => {
    if (!mine) return;
    if (!confirming) { setConfirming(true); return; }
    await apiRequest<void>(`/resume-themes/${mine.id}`, { method: 'DELETE' });
    setConfirming(false); list.reload(); onPick('onyx');
  });

  const colourBad = edit ? !accentOk(edit.tokens.accent) : false;
  return <section aria-labelledby="theme-title" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 rounded-xl border bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="theme-title" className="flex items-center gap-2 text-lg font-semibold"><Palette className="size-5 text-primary" aria-hidden="true" />{c.title}</h2>
      <div className="flex flex-wrap gap-2">
        {!edit && chosen && <Button size="sm" variant="outline" onClick={() => change(seed())}>{c.customize}</Button>}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => file.current?.click()}><Upload className="size-4" aria-hidden="true" />{c.import}</Button>
        <input ref={file} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label={c.import}
          onChange={event => { importFile(event.target.files?.[0]); event.target.value = ''; }} />
      </div>
    </div>

    <div className="grid gap-2"><h3 className="text-sm font-medium"><span className="mr-2 text-primary">1</span>{c.pick}</h3>
      <p className="text-xs text-muted-foreground">{c.presets}</p>
      <div role="group" aria-label={c.presets} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {presets.map((p: Preset) => <Card key={p.id} id={p.id} name={locale === 'th' ? p.th : p.en} layout={p.layout}
          tokens={p.id in LEGACY ? { ...p.tokens, accent: templateId === p.id ? hexOfAccent : p.tokens.accent } : p.tokens}
          selected={templateId === p.id} c={c} ats={p.ats_safe} photo={p.photo} onPick={pick} />)}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{c.mine}</p>
      {custom.length === 0 ? <p className="text-sm text-muted-foreground">{c.noneYet}</p> :
        <div role="group" aria-label={c.mine} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {custom.map(t => <Card key={t.id} id={customId(t.id)} name={t.name} layout={t.layout} tokens={t.tokens} selected={templateId === customId(t.id)}
            c={c} ats={t.ats_safe} photo={t.photo} onPick={pick} />)}
        </div>}
    </div>

    {chosen && !chosen.ats_safe && <p className="flex items-start gap-2 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />{c.ats}</p>}
    {hasPhoto && chosen && !chosen.photo && <p className="flex items-start gap-2 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />{c.noPhoto}</p>}

    {edit && <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 rounded-xl border bg-card p-4">
      <h3 className="text-sm font-medium"><span className="mr-2 text-primary">2</span>{c.adjust}</h3>
      <p className="text-xs text-muted-foreground" role="status">{c.unsaved}</p>
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <div className="grid gap-2"><span className="text-sm font-medium">{c.colour}</span>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map(a => <button key={a.id} type="button" aria-label={bc.accents[a.id]} aria-pressed={edit.tokens.accent.toUpperCase() === a.hex.toUpperCase()} onClick={() => token('accent', a.hex)}
              className="grid size-11 place-items-center rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-foreground"><span className="size-7 rounded-full" style={{ background: a.hex }} /></button>)}
            <Label htmlFor="theme-hex" className="sr-only">{c.hex}</Label>
            <Input id="theme-hex" className="w-28 font-mono uppercase" value={edit.tokens.accent} maxLength={7} aria-invalid={colourBad} aria-describedby={colourBad ? 'theme-hex-error' : undefined}
              onChange={e => token('accent', e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)} />
          </div>
          {colourBad && <p id="theme-hex-error" className="text-sm text-destructive" role="alert">{/^#[0-9a-fA-F]{6}$/.test(edit.tokens.accent) ? c.contrast : c.badHex}</p>}
        </div>
        <Seg label={c.layout} value={edit.layout} options={LAYOUTS.map(l => [l, l.charAt(0).toUpperCase() + l.slice(1)] as [string, string])} onChange={v => edit && change({ ...edit, layout: v })} />
        <Seg label={c.font} value={edit.tokens.font_pair} options={[['sans', c.sans], ['serif', c.serif]]} onChange={v => token('font_pair', v)} />
        <Seg label={c.size} value={edit.tokens.size} options={[['small', c.small], ['normal', c.normal], ['large', c.large]]} onChange={v => token('size', v)} />
        <Seg label={c.density} value={edit.tokens.density} options={[['compact', c.compact], ['normal', c.normal], ['relaxed', c.relaxed]]} onChange={v => token('density', v)} />
        <Seg label={c.headings} value={edit.tokens.heading_style} options={[['plain', c.plain], ['rule', c.rule], ['band', c.band]]} onChange={v => token('heading_style', v)} />
      </div>
      <h3 className="text-sm font-medium"><span className="mr-2 text-primary">3</span>{c.share}</h3>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-2"><Label htmlFor="theme-name">{c.name}</Label>
          <Input id="theme-name" ref={nameInput} className="w-56" value={edit.name} maxLength={60} aria-invalid={nameMissing} aria-describedby={nameMissing ? 'theme-name-error' : undefined}
            onChange={e => change({ ...edit, name: e.target.value })} />
          {nameMissing && <p id="theme-name-error" className="text-sm text-destructive">{c.needName}</p>}</div>
        <Button size="sm" busy={busy} disabled={busy || colourBad} onClick={() => void saveTheme()}>{c.save}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => change(null)}>{c.cancel}</Button>
      </div>
    </div>}

    {mine && !edit && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" asChild><a href={`/v1/resume-themes/${mine.id}/export`} download="resume-theme.json"><Download className="size-4" aria-hidden="true" />{c.export}</a></Button>
      <Button size="sm" variant={confirming ? 'destructive' : 'ghost'} disabled={busy} onClick={() => void remove()}><Trash2 className="size-4" aria-hidden="true" />{confirming ? c.confirmRemove : c.remove}</Button>
    </div>}
    {note && <p role={note.kind === 'error' ? 'alert' : 'status'} className={note.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'}>{note.text}</p>}
  </section>;
}

// The six original templates keep the owner's accent choice (their accent is picked with the swatches below the picker).
const LEGACY: Record<string, true> = { onyx: true, kakuna: true, ditgar: true, lotus: true, teak: true, saffron: true };
