import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { admin } from '@/lib/api';
import { errText, taskName } from './lib';

/** Removes a model from the gateway and the price list. No typed phrase: past costs are kept and the server refuses a model a task uses. */
export function DeleteModelDialog({ model, usedBy, onClose, onRemoved, onShowTasks }: { model: string; usedBy: string[]; onClose: () => void; onRemoved: (message: string) => void; onShowTasks: () => void }) {
  const { t } = useTranslation('admin-models');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    setBusy(true); setError(null);
    try { await admin.deleteModel(model); onRemoved(t('library.removed', { model })); } catch (e) { setError(errText(t, e)); setBusy(false); }
  }
  const blocked = usedBy.length > 0;
  return <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
    <DialogContent>
      <DialogTitle className="[overflow-wrap:anywhere]">{t(blocked ? 'remove.blockedTitle' : 'remove.title', { model })}</DialogTitle>
      <DialogDescription>{blocked ? t('remove.blockedBody', { tasks: usedBy.map(op => taskName(t, op)).join(', ') }) : t('remove.body')}</DialogDescription>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild><Button variant="outline" disabled={busy}>{t('remove.cancel')}</Button></DialogClose>
        {blocked ? <Button onClick={onShowTasks}>{t('remove.changeTasks')}</Button>
          : <Button variant="destructive" busy={busy} onClick={() => void remove()}>{t('remove.confirm')}</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
