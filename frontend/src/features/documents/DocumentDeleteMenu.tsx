import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { ItemMenu } from '@/components/ItemMenu';
import { apiRequest } from '../../lib/api';

// "..." menu + confirm dialog that permanently deletes a document (409 document_in_use while an approval is pending).
export function DocumentDeleteMenu({ projectId, documentId, title, onDeleted }: { projectId: string; documentId: string; title: string; onDeleted: () => void }) {
  const th = useTranslation().i18n.language.startsWith('th');
  const [open, setOpen] = useState(false);
  const label = th ? 'ลบเอกสาร' : 'Delete document';
  return <>
    <ItemMenu label={th ? `ตัวเลือกสำหรับ ${title}` : `Options for ${title}`}
      actions={[{ label, icon: <Trash2 className="size-4" aria-hidden="true" />, destructive: true, onSelect: () => setOpen(true) }]} />
    {open && <ConfirmDeleteDialog confirmLabel={th ? 'ลบถาวร' : 'Delete permanently'}
      title={th ? `ลบ “${title}” ถาวร?` : `Permanently delete “${title}”?`}
      description={th ? 'เอกสาร ทุกฉบับแก้ไข และไฟล์ที่ดาวน์โหลดได้จะถูกลบและกู้คืนไม่ได้' : 'The document, all of its revisions and downloadable files will be deleted and cannot be recovered.'}
      errors={{ document_in_use: <>{th ? 'ลบไม่ได้: มีคำขออนุมัติที่ยังรอตัดสินใจเกี่ยวกับเอกสารนี้ ' : 'Cannot delete: an approval request about this document is still waiting for a decision. '}
        <Link className="underline" to={`/app/projects/${projectId}/console?tab=approvals`}>{th ? 'ไปที่ Agent Console' : 'Go to the Agent Console'}</Link></> }}
      onConfirm={() => apiRequest(`/projects/${projectId}/documents/${documentId}`, { method: 'DELETE' }).then(() => undefined)}
      onDone={() => { setOpen(false); onDeleted(); }} onClose={() => setOpen(false)} />}
  </>;
}
