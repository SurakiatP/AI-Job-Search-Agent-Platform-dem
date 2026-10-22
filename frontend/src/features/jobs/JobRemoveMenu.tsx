import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { ItemMenu } from '@/components/ItemMenu';
import { apiRequest } from '../../lib/api';

// "..." menu + confirm dialog that soft-removes a saved job from the project.
export function JobRemoveMenu({ projectId, jobId, title, reveal, onRemoved }: { projectId: string; jobId: string; title: string; reveal?: boolean; onRemoved: () => void }) {
  const th = useTranslation().i18n.language.startsWith('th');
  const [open, setOpen] = useState(false);
  const label = th ? 'ลบออกจากโปรเจกต์' : 'Remove from project';
  return <>
    <ItemMenu reveal={reveal} label={th ? `ตัวเลือกสำหรับ ${title}` : `Options for ${title}`}
      actions={[{ label, icon: <Trash2 className="size-4" aria-hidden="true" />, destructive: true, onSelect: () => setOpen(true) }]} />
    {open && <ConfirmDeleteDialog confirmLabel={label}
      title={th ? `ลบ “${title}” ออกจากโปรเจกต์?` : `Remove “${title}” from this project?`}
      description={th ? 'งานนี้จะหายจากรายการและตัวเลือกการประเมิน ประวัติการประเมินเดิมยังดูได้ใน Agent Console' : 'This job disappears from the list and from the evaluation choices. Earlier evaluations stay available in the Agent Console.'}
      onConfirm={() => apiRequest(`/projects/${projectId}/jobs/${jobId}`, { method: 'DELETE' }).then(() => undefined)}
      onDone={() => { setOpen(false); onRemoved(); }} onClose={() => setOpen(false)} />}
  </>;
}
