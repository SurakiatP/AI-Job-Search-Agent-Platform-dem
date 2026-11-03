import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiError } from '../../lib/api-types';
import { sendJson } from './useResource';

const copy = {
  th: {
    title: (name: string) => `ลบโปรเจกต์ “${name}” พร้อมข้อมูลทั้งหมด?`,
    lead: 'การลบนี้ย้อนกลับไม่ได้ และจะลบสิ่งเหล่านี้ทิ้งทั้งหมด:',
    items: ['CV ทุกฉบับและทุกเวอร์ชัน รวมถึงรูปและไฟล์ที่อัปโหลด', 'งานที่บันทึก ผลประเมิน และใบสมัครพร้อมประวัติ', 'เอกสารที่สร้างไว้ ชุดข้อสัมภาษณ์ และข้อเท็จจริงในคลังประสบการณ์', 'ประวัติการทำงานของเอเจนต์ คำขออนุมัติ การเชื่อมต่อ และโทเคนของโปรเจกต์นี้'],
    notRecoverable: 'ไม่มีถังขยะและกู้คืนไม่ได้ โปรเจกต์อื่นของคุณจะไม่ถูกแตะ',
    type: (name: string) => `พิมพ์ชื่อโปรเจกต์ “${name}” เพื่อยืนยัน`,
    confirm: 'ลบทั้งหมดถาวร', cancel: 'ยกเลิก', working: 'กำลังลบ…',
    active: 'ลบไม่ได้: มีงานของเอเจนต์กำลังทำหรือรออนุมัติอยู่ หยุดงานก่อน แล้วลองอีกครั้ง',
    failed: 'ดำเนินการไม่สำเร็จ ลองอีกครั้ง',
  },
  en: {
    title: (name: string) => `Delete project “${name}” and everything in it?`,
    lead: 'This cannot be undone. All of this is erased:',
    items: ['Every CV and version, including photos and uploaded files', 'Saved jobs, evaluations and applications with their history', 'Generated documents, interview sets and experience bank facts', "Agent run history, approval requests, connections and tokens for this project"],
    notRecoverable: 'There is no trash and no way back. Your other projects are not touched.',
    type: (name: string) => `Type the project name “${name}” to confirm`,
    confirm: 'Delete everything permanently', cancel: 'Cancel', working: 'Deleting…',
    active: 'Cannot delete: an agent run is working or waiting for approval. Stop it first, then try again.',
    failed: 'That did not work. Try again.',
  },
};

// Owner-only erase of a project and all of its data (POST /projects/{id}/force-delete). The user must type the exact name.
export function ForceDeleteProjectDialog({ id, name, onDone, onClose }: { id: string; name: string; onDone: () => void; onClose: () => void }) {
  const c = copy[useTranslation().i18n.language.startsWith('th') ? 'th' : 'en'];
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = typed === name;
  async function submit() {
    if (busy || !matches) return;
    setBusy(true); setError('');
    try {
      await sendJson(`/projects/${id}/force-delete`, 'POST', { confirm_name: typed });
      onDone();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) { onDone(); return; } // already gone
      setError(caught instanceof ApiError && caught.code === 'project_runs_active' ? c.active : c.failed);
      setBusy(false);
    }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent>
      <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <DialogTitle className="[overflow-wrap:anywhere]">{c.title(name)}</DialogTitle>
        <DialogDescription className="sr-only">{c.lead}</DialogDescription>
        <div className="grid gap-2 text-sm">
          <p>{c.lead}</p>
          <ul className="grid list-disc gap-1 ps-5 text-muted-foreground">{c.items.map(item => <li key={item}>{item}</li>)}</ul>
          <p className="font-medium text-destructive">{c.notRecoverable}</p>
        </div>
        <label className="grid gap-2 text-sm font-medium [overflow-wrap:anywhere]">{c.type(name)}
          <Input autoFocus autoComplete="off" spellCheck={false} maxLength={200} value={typed} onChange={event => setTyped(event.target.value)} aria-invalid={typed.length > 0 && !matches} />
        </label>
        {error && <Alert severity="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>{c.cancel}</Button></DialogClose>
          <Button type="submit" variant="destructive" busy={busy} disabled={busy || !matches}>{busy ? c.working : c.confirm}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
