import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ItemMenu } from '@/components/ItemMenu';
import { apiRequest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';

// "..." menu with one action that moves a document to the trash (soft delete; undo and restore live on the Documents page).
export function DocumentDeleteMenu({ projectId, documentId, title, onTrashed, onFailed }: { projectId: string; documentId: string; title: string; onTrashed: () => void; onFailed: () => void }) {
  const th = useTranslation().i18n.language.startsWith('th');
  async function trash() {
    try { await apiRequest(`/projects/${projectId}/documents/${documentId}`, { method: 'DELETE' }); onTrashed(); } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) onTrashed(); else onFailed();
    }
  }
  return <ItemMenu label={th ? `ตัวเลือกสำหรับ ${title}` : `Options for ${title}`}
    actions={[{ label: th ? 'ย้ายไปถังขยะ' : 'Move to trash', icon: <Trash2 className="size-4" aria-hidden="true" />, onSelect: () => { void trash(); } }]} />;
}
