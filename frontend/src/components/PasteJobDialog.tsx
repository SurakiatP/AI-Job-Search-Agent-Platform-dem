import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { JobRevisionView } from '../lib/api-types';
import { EvaluateButton } from '../features/sessions/EvaluateButton';
import { safeHttpUrl, sendJson } from '../features/projects/useResource';

const copy = {
  th: {
    title: 'วางประกาศงาน', desc: 'คัดลอกข้อความประกาศงานมาวาง ระบบบันทึกไว้ให้ แล้วประเมินกับ CV ของคุณได้ทันที',
    posting: 'ข้อความประกาศงาน', jobTitle: 'ชื่อตำแหน่ง (ไม่ใส่ก็ได้ ใช้บรรทัดแรกของประกาศ)', company: 'บริษัท (ไม่ใส่ก็ได้)', url: 'ลิงก์ประกาศ (ไม่ใส่ก็ได้)',
    missing: 'วางข้อความประกาศงานก่อน', badUrl: 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://', failed: 'บันทึกประกาศงานไม่สำเร็จ ลองอีกครั้ง',
    save: 'บันทึกประกาศงาน', cancel: 'ยกเลิก', saved: (t: string) => `บันทึก “${t}” แล้ว`, evaluate: 'ประเมินกับ CV เลย', later: 'ไว้ทีหลัง',
  },
  en: {
    title: 'Paste a job posting', desc: 'Paste the text of a posting. It is saved, and you can score it against your CV right away.',
    posting: 'Posting text', jobTitle: 'Job title (optional, the first line of the posting is used)', company: 'Company (optional)', url: 'Link to the posting (optional)',
    missing: 'Paste the posting text first.', badUrl: 'The link must start with http:// or https://.', failed: 'Could not save the posting. Try again.',
    save: 'Save posting', cancel: 'Cancel', saved: (t: string) => `Saved “${t}”.`, evaluate: 'Score it against my CV', later: 'Later',
  },
};

// Same endpoint and body as the add-posting form on My jobs (POST /projects/:id/jobs).
export function PasteJobDialog({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved?: (job: JobRevisionView) => void }) {
  const { i18n } = useTranslation();
  const c = copy[i18n.language.startsWith('th') ? 'th' : 'en'];
  const [form, setForm] = useState({ title: '', company: '', url: '', description: '' });
  const [error, setError] = useState<'missing' | 'badUrl' | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<JobRevisionView | null>(null);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => { setForm(current => ({ ...current, [key]: event.target.value })); setError(null); };

  async function save() {
    if (busy) return;
    const description = form.description.trim();
    if (!description) { setError('missing'); return; }
    const source = form.url.trim() ? safeHttpUrl(form.url.trim()) : null;
    if (form.url.trim() && !source) { setError('badUrl'); return; }
    const title = form.title.trim() || description.split('\n').find(line => line.trim())!.trim().slice(0, 300);
    setBusy(true); setError(null);
    try {
      const job = await sendJson<JobRevisionView>(`/projects/${projectId}/jobs`, 'POST', { title, description: form.description, company: form.company.trim() || null, source_url: source });
      setSaved(job); onSaved?.(job);
    } catch { setError('failed'); } finally { setBusy(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-lg">
      <DialogTitle>{c.title}</DialogTitle>
      <DialogDescription>{c.desc}</DialogDescription>
      {saved ? <div className="grid gap-4">
        <p role="status" className="flex items-start gap-2 text-sm font-medium"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /><span className="min-w-0 break-words">{c.saved(saved.title)}</span></p>
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild><Button type="button" variant="outline">{c.later}</Button></DialogClose>
          <EvaluateButton projectId={projectId} job={{ savedId: saved.id }}>{c.evaluate}</EvaluateButton>
        </div>
      </div> : <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="grid gap-2"><Label htmlFor="paste-job-text">{c.posting}</Label><Textarea id="paste-job-text" rows={8} maxLength={50000} required value={form.description} aria-invalid={error === 'missing'} aria-describedby={error ? 'paste-job-error' : undefined} onChange={set('description')} /></div>
        <div className="grid gap-2"><Label htmlFor="paste-job-title">{c.jobTitle}</Label><Input id="paste-job-title" maxLength={300} value={form.title} onChange={set('title')} /></div>
        <div className="grid gap-2"><Label htmlFor="paste-job-company">{c.company}</Label><Input id="paste-job-company" maxLength={300} value={form.company} onChange={set('company')} /></div>
        <div className="grid gap-2"><Label htmlFor="paste-job-url">{c.url}</Label><Input id="paste-job-url" inputMode="url" maxLength={2048} aria-invalid={error === 'badUrl'} value={form.url} onChange={set('url')} /></div>
        {error && <Alert severity="error" id="paste-job-error" role="alert">{error === 'missing' ? c.missing : error === 'badUrl' ? c.badUrl : c.failed}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>{c.cancel}</Button></DialogClose>
          <Button type="submit" busy={busy} disabled={busy}>{c.save}</Button>
        </div>
      </form>}
    </DialogContent>
  </Dialog>;
}
