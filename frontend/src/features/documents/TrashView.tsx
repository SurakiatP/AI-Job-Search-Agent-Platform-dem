import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { apiRequest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';

export type TrashedDocument = { id: string; document_type: 'cv' | 'cover_letter' | 'application_message' | 'other'; title: string; trashed_at?: string | null };

export function relativeTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '';
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(0, 'second');
}

// Link to the Agent Console shown when a permanent delete is refused with 409 document_in_use.
export function inUseMessage(th: boolean, projectId: string) {
  return <>{th ? 'ลบไม่ได้: มีคำขออนุมัติที่ยังรอตัดสินใจเกี่ยวกับเอกสารนี้ ' : 'Cannot delete: an approval request about this document is still waiting for a decision. '}
    <Link className="underline" to={`/app/projects/${projectId}/console?tab=approvals`}>{th ? 'ไปที่ Agent Console' : 'Go to the Agent Console'}</Link></>;
}

export const permanentDescription = (th: boolean) => th ? 'เอกสาร ทุกฉบับแก้ไข และไฟล์จะถูกลบและกู้คืนไม่ได้' : 'The document, all of its revisions and files will be deleted and cannot be recovered.';
export const permanentTitle = (th: boolean, title: string) => th ? `ลบ “${title}” ถาวร?` : `Permanently delete “${title}”?`;

export function deletePermanently(projectId: string, documentId: string) {
  return apiRequest(`/projects/${projectId}/documents/${documentId}/permanent`, { method: 'DELETE' }).then(() => undefined);
}

export function restoreDocument(projectId: string, documentId: string) {
  return apiRequest(`/projects/${projectId}/documents/${documentId}/restore`, { method: 'POST' });
}

export function TrashView({ projectId, items, typeLabel, onChanged }: { projectId: string; items: TrashedDocument[]; typeLabel: (type: TrashedDocument['document_type']) => string; onChanged: () => void }) {
  const { i18n } = useTranslation();
  const th = i18n.language.startsWith('th');
  const locale = th ? 'th' : 'en';
  const [target, setTarget] = useState<TrashedDocument | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [failure, setFailure] = useState('');
  async function restore(item: TrashedDocument) {
    setBusyId(item.id); setFailure('');
    try { await restoreDocument(projectId, item.id); onChanged(); } catch {
      setFailure(th ? `กู้คืน “${item.title}” ไม่สำเร็จ ลองอีกครั้ง` : `Could not restore “${item.title}”. Try again.`);
    } finally { setBusyId(''); }
  }
  async function emptyTrash() {
    const failed: string[] = [];
    for (const item of items) {
      try { await deletePermanently(projectId, item.id); } catch (caught) {
        if (!(caught instanceof ApiError && caught.status === 404)) failed.push(item.title);
      }
    }
    setFailure(failed.length ? (th ? `ลบถาวรไม่สำเร็จ ${failed.length} รายการ (อาจมีคำขออนุมัติค้างอยู่): ${failed.join(', ')}` : `${failed.length} could not be deleted (an approval may be pending): ${failed.join(', ')}`) : '');
    setEmptying(false); onChanged();
  }
  if (!items.length) return <p className="text-sm text-muted-foreground">{th ? 'ถังขยะว่าง' : 'Trash is empty'}</p>;
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{th ? 'เอกสารในถังขยะซ่อนอยู่จากผลลัพธ์ที่แชร์ กู้คืนหรือลบถาวรได้ที่นี่' : 'Trashed documents are hidden from shared results. Restore or delete them permanently here.'}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => setEmptying(true)}><Trash2 className="size-4" aria-hidden="true" />{th ? 'ลบทั้งหมดถาวร' : 'Empty trash'}</Button>
    </div>
    {failure && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{failure}</p>}
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(item => <li key={item.id}><Card className="h-full"><CardHeader>
      <CardTitle className="min-w-0 break-words text-base"><Link className="hover:underline" to={`/app/projects/${projectId}/documents/${item.id}`}>{item.title}</Link></CardTitle>
    </CardHeader><CardContent className="grid gap-3">
      <p className="text-sm text-muted-foreground">{typeLabel(item.document_type)}{item.trashed_at && <> · {th ? 'ย้ายไปถังขยะ' : 'Trashed'} <time dateTime={item.trashed_at}>{relativeTime(item.trashed_at, locale)}</time></>}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busyId === item.id} onClick={() => { void restore(item); }}><RotateCcw className="size-4" aria-hidden="true" />{th ? 'กู้คืน' : 'Restore'}</Button>
        <Button type="button" variant="destructive" size="sm" onClick={() => setTarget(item)}>{th ? 'ลบถาวร' : 'Delete permanently'}</Button>
      </div>
    </CardContent></Card></li>)}</ul>
    {target && <ConfirmDeleteDialog confirmLabel={th ? 'ลบถาวร' : 'Delete permanently'} title={permanentTitle(th, target.title)} description={permanentDescription(th)}
      errors={{ document_in_use: inUseMessage(th, projectId) }} onConfirm={() => deletePermanently(projectId, target.id)}
      onDone={() => { setTarget(null); setFailure(''); onChanged(); }} onClose={() => setTarget(null)} />}
    {emptying && <ConfirmDeleteDialog confirmLabel={th ? 'ลบทั้งหมดถาวร' : 'Empty trash'} title={th ? `ลบเอกสาร ${items.length} รายการถาวร?` : `Permanently delete ${items.length} documents?`} description={permanentDescription(th)}
      onConfirm={emptyTrash} onDone={() => undefined} onClose={() => setEmptying(false)} />}
  </div>;
}
