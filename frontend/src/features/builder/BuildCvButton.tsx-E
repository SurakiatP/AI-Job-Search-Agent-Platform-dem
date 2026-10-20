import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FilePlus2 } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { sendJson } from '../projects/useResource';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';

const copy = {
  th: { button: 'สร้าง CV ในระบบ', title: 'สร้าง CV ในระบบ', body: 'กรอกข้อมูลในแบบฟอร์ม เลือกเทมเพลต แล้วดูตัวอย่าง PDF จริงได้ระหว่างแก้ไข', name: 'ชื่อ CV', defaultName: 'CV ของฉัน',
    fromBank: 'เริ่มจากข้อมูลในคลังประสบการณ์ (ถ้ามี)', create: 'เริ่มสร้าง', cancel: 'ยกเลิก', failed: 'สร้างไม่สำเร็จ ลองอีกครั้ง' },
  en: { button: 'Build a CV', title: 'Build a CV in the app', body: 'Fill in a form, pick a template and see the real PDF while you edit.', name: 'CV name', defaultName: 'My CV',
    fromBank: 'Start from my experience bank (if any)', create: 'Start', cancel: 'Cancel', failed: 'Could not create it. Try again.' },
};

/** Creates a builder CV and opens the builder; offered wherever a CV is required. */
export function BuildCvButton({ projectId, variant = 'outline', size }: { projectId: string; variant?: 'default' | 'outline'; size?: 'sm' }) {
  const { locale } = useLocale();
  const c = copy[locale];
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(c.defaultName);
  const [fromBank, setFromBank] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function create() {
    setBusy(true); setError(false);
    try {
      const cv = await sendJson<{ id: string }>(`/projects/${projectId}/cvs/builder`, 'POST', { name: name.trim() || c.defaultName, from_experience: fromBank, document_language: locale });
      navigate(`/app/projects/${projectId}/cvs/${cv.id}/builder`);
    } catch { setError(true); setBusy(false); }
  }
  return <>
    <Button variant={variant} size={size} onClick={() => setOpen(true)}><FilePlus2 className="size-4" aria-hidden="true" />{c.button}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>{c.title}</DialogTitle>
        <DialogDescription>{c.body}</DialogDescription>
        <div className="grid gap-1.5"><Label htmlFor="build-cv-name">{c.name}</Label><Input id="build-cv-name" value={name} maxLength={120} onChange={e => setName(e.target.value)} /></div>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={fromBank} onChange={e => setFromBank(e.target.checked)} />{c.fromBank}</label>
        {error && <p role="alert" className="text-sm text-destructive">{c.failed}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>{c.cancel}</Button><Button busy={busy} onClick={() => void create()}>{c.create}</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
