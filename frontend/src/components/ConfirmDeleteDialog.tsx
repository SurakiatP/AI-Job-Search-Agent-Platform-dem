import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../lib/api-types';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

// Destructive confirm. `errors` maps a 409 error code to inline copy; any other failure shows a generic retry message.
// A 404 means the item is already gone, so it counts as success.
export function ConfirmDeleteDialog({ title, description, confirmLabel, onConfirm, onDone, onClose, errors = {} }: {
  title: string; description: string; confirmLabel: string; onConfirm: () => Promise<void>; onDone: () => void; onClose: () => void; errors?: Record<string, ReactNode>;
}) {
  const th = useTranslation().i18n.language.startsWith('th');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactNode>('');
  async function submit() {
    if (busy) return;
    setBusy(true); setError('');
    try { await onConfirm(); onDone(); } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) { onDone(); return; }
      setError((caught instanceof ApiError && caught.status === 409 && errors[caught.code]) || (th ? 'ดำเนินการไม่สำเร็จ ลองอีกครั้ง' : 'That did not work. Try again.'));
      setBusy(false);
    }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent>
      <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {error && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>{th ? 'ยกเลิก' : 'Cancel'}</Button></DialogClose>
          <Button type="submit" variant="destructive" disabled={busy}>{confirmLabel}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
