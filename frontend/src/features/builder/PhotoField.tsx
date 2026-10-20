// CV photo (CR-CVT-01): checked and cropped to a 3:4 portrait in the browser, stored privately, never sent to AI.
import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { apiRequest } from '../../lib/api';
import type { copy } from './copy';

const MAX_BYTES = 2 * 1024 * 1024;

// ponytail: automatic centre crop with a slight upward bias (faces sit high); add a drag-to-crop dialog if owners ask.
async function portrait(file: File): Promise<Blob> {
  const image = await createImageBitmap(file);
  const width = Math.min(image.width, (image.height * 3) / 4);
  const height = (width * 4) / 3;
  const scale = Math.min(1, 900 / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const top = Math.max(0, (image.height - height) * 0.3);
  canvas.getContext('2d')!.drawImage(image, (image.width - width) / 2, top, width, height, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('encode');
  return blob;
}

export function PhotoField({ projectId, photoId, onChange, c }: { projectId: string; photoId: string; onChange: (id: string) => void; c: (typeof copy)['en'] }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setError(c.photoType); return; }
    if (file.size > MAX_BYTES) { setError(c.photoSize); return; }
    setBusy(true);
    try {
      let blob: Blob;
      try { blob = await portrait(file); } catch { setError(c.photoType); return; }
      const body = new FormData();
      body.set('file', blob, 'photo.jpg');
      const saved = await apiRequest<{ id: string }>(`/projects/${projectId}/resume-photos`, { method: 'POST', body });
      onChange(saved.id);
    } catch { setError(c.photoFailed); } finally { setBusy(false); }
  }

  const label = photoId ? c.changePhoto : c.addPhoto;
  return <div className="grid gap-2">
    <h3 className="text-sm font-medium">{c.photo}</h3>
    <div className="flex flex-wrap items-center gap-3">
      {photoId && <img src={`/v1/projects/${projectId}/resume-photos/${photoId}`} alt={c.photoAlt}
        className="h-20 w-15 shrink-0 rounded-md border object-cover" />}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" busy={busy} disabled={busy} onClick={() => input.current?.click()}><ImagePlus className="size-4" aria-hidden="true" />{label}</Button>
        {photoId && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onChange('')}><Trash2 className="size-4" aria-hidden="true" />{c.removePhoto}</Button>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-label={label}
        onChange={event => { void choose(event.target.files?.[0]); event.target.value = ''; }} />
    </div>
    <p className="text-sm text-muted-foreground">{c.photoHint}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
