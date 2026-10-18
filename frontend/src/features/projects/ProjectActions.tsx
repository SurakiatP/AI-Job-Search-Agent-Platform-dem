import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { ItemMenu } from '@/components/ItemMenu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiRequest } from '../../lib/api';
import { useProjectCopy } from './copy';
import { sendJson } from './useResource';

type Mode = 'rename' | 'delete' | null;

function RenameDialog({ id, name, onClose, onDone }: { id: string; name: string; onClose: () => void; onDone: () => void }) {
  const { c } = useProjectCopy();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    const next = value.trim();
    if (busy || !next) return;
    if (next === name) { onClose(); return; }
    setBusy(true); setError('');
    try { await sendJson(`/projects/${id}`, 'PATCH', { name: next }); onDone(); } catch { setError(c.failed); setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent aria-describedby={undefined}>
      <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <DialogTitle>{c.renameTitle}</DialogTitle>
        <label className="grid gap-1.5 text-sm font-medium">{c.name}<Input autoFocus maxLength={200} value={value} onChange={event => setValue(event.target.value)} onFocus={event => event.currentTarget.select()} /></label>
        {error && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>{c.cancel}</Button></DialogClose>
          <Button type="submit" busy={busy} disabled={busy || !value.trim()}>{busy ? c.saving : c.save}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

// Rename / delete for one project row; `onChanged` reloads the list.
export function ProjectActions({ id, name, onChanged }: { id: string; name: string; onChanged: () => void }) {
  const { c } = useProjectCopy();
  const [mode, setMode] = useState<Mode>(null);
  const done = () => { setMode(null); onChanged(); };
  return <>
    <ItemMenu label={c.options(name)} className="size-11" actions={[
      { label: c.rename, icon: <Pencil className="size-4" aria-hidden="true" />, onSelect: () => setMode('rename') },
      { label: c.delete, icon: <Trash2 className="size-4" aria-hidden="true" />, destructive: true, onSelect: () => setMode('delete') },
    ]} />
    {mode === 'rename' && <RenameDialog id={id} name={name} onClose={() => setMode(null)} onDone={done} />}
    {mode === 'delete' && <ConfirmDeleteDialog title={c.deleteTitle(name)} description={c.deleteBody} confirmLabel={c.delete} errors={{ project_not_empty: c.notEmpty }}
      onConfirm={() => apiRequest(`/projects/${id}`, { method: 'DELETE' }).then(() => undefined)} onDone={done} onClose={() => setMode(null)} />}
  </>;
}
