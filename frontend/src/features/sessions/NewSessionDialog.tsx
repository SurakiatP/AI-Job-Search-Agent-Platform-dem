import { useState, type ReactNode } from 'react';
import { CvPreviewButton } from '@/components/CvPreview';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '../../lib/api';
import { ApiError, type CVView, type JobRevisionView, type SessionView } from '../../lib/api-types';
import { useResource } from '../projects/useResource';

export type InlineJobDraft = { title: string; company?: string | null; description: string; source_url?: string | null };
export type SessionJob = { savedId?: string; inline?: InlineJobDraft };

const selectClass = 'flex min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
const copy = {
  th: { title: 'เริ่มเซสชันใหม่', desc: 'จับคู่ CV หนึ่งฉบับกับประกาศงานหนึ่งรายการ ระบบจะเริ่มประเมินความเหมาะสมให้ทันที', cv: 'CV', job: 'ประกาศงาน', saved: 'งานที่บันทึกไว้', paste: 'วางประกาศงานใหม่', pick: 'เลือกงาน', jtitle: 'ตำแหน่งงาน', company: 'บริษัท (ไม่บังคับ)', url: 'ลิงก์ต้นทาง (ไม่บังคับ)', jdesc: 'รายละเอียดงาน', start: 'เริ่มเซสชัน', starting: 'กำลังสร้าง…', cancel: 'ยกเลิก', noCv: 'ยังไม่มี CV', noCvBody: 'เพิ่ม CV ก่อนจึงจะเริ่มเซสชันได้', addCv: 'ไปหน้า CV', exists: 'มีเซสชันสำหรับ CV เวอร์ชันนี้กับงานนี้อยู่แล้ว', open: 'เปิดเซสชันที่มีอยู่', provider: 'ยังไม่ได้ตั้งค่าผู้ให้บริการ AI', settings: 'ไปที่การตั้งค่า', failed: 'สร้างเซสชันไม่สำเร็จ ลองอีกครั้ง', notFound: 'ไม่พบ CV หรืองานที่เลือก ลองโหลดหน้าใหม่', loadFailed: 'โหลดข้อมูลไม่สำเร็จ', loading: 'กำลังโหลด…' },
  en: { title: 'New session', desc: 'Pair one CV with one job posting. The fit evaluation starts right away.', cv: 'CV', job: 'Job posting', saved: 'Saved job', paste: 'Paste a new job', pick: 'Choose a job', jtitle: 'Job title', company: 'Company (optional)', url: 'Source link (optional)', jdesc: 'Job description', start: 'Start session', starting: 'Creating…', cancel: 'Cancel', noCv: 'No CV yet', noCvBody: 'Add a CV before starting a session.', addCv: 'Go to CV page', exists: 'A session for this CV version and job already exists.', open: 'Open existing session', provider: 'The AI provider is not configured yet.', settings: 'Open settings', failed: 'Could not create the session. Try again.', notFound: 'The CV or job was not found. Reload the page and try again.', loadFailed: 'Could not load data', loading: 'Loading…' },
};

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1.5 text-sm font-medium">{label}{children}</label>; }

export function NewSessionDialog({ projectId, job, cvName, onClose }: { projectId: string; job?: SessionJob; cvName?: string; onClose: () => void }) {
  const locale = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const navigate = useNavigate();
  const base = `/app/projects/${projectId}`;
  const cvs = useResource<CVView[]>(`/projects/${projectId}/cvs`);
  const jobs = useResource<JobRevisionView[]>(`/projects/${projectId}/jobs`);
  const usable = (cvs.data ?? []).filter(item => item.latest_revision);
  const saved = jobs.data ?? [];
  const [cvPick, setCvPick] = useState('');
  const [mode, setMode] = useState<'saved' | 'new' | ''>(job?.inline ? 'new' : job?.savedId ? 'saved' : '');
  const [savedPick, setSavedPick] = useState(job?.savedId ?? '');
  const [form, setForm] = useState({ title: job?.inline?.title ?? '', company: job?.inline?.company ?? '', source_url: job?.inline?.source_url ?? '', description: job?.inline?.description ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'' | 'failed' | 'notFound' | 'provider'>('');
  const [existing, setExisting] = useState('');
  const ready = cvs.status === 'ready' && jobs.status === 'ready';
  const cv = usable.find(item => item.id === cvPick) ?? usable.find(item => cvName && item.name === cvName) ?? usable.find(item => item.is_primary) ?? usable[0];
  const effectiveMode = mode || (saved.length ? 'saved' : 'new');
  const savedId = saved.some(item => item.id === savedPick) ? savedPick : saved[0]?.id ?? '';
  const valid = Boolean(cv) && (effectiveMode === 'saved' ? Boolean(savedId) : form.title.trim() && form.description.trim());
  async function submit() {
    if (!cv?.latest_revision || busy || !valid) return;
    setBusy(true); setError(''); setExisting('');
    const jobPart = effectiveMode === 'saved' ? { job_revision_id: savedId } : { job: { title: form.title.trim(), description: form.description.trim(), ...(form.company.trim() ? { company: form.company.trim() } : {}), ...(form.source_url.trim() ? { source_url: form.source_url.trim() } : {}) } };
    try {
      const session = await apiRequest<SessionView>(`/projects/${projectId}/sessions`, { method: 'POST', body: JSON.stringify({ cv_revision_id: cv.latest_revision.id, ...jobPart }) });
      window.dispatchEvent(new Event('sessions:changed'));
      onClose(); navigate(`${base}/sessions/${session.id}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'session_pair_exists' && caught.fields?.session_id) setExisting(caught.fields.session_id);
      else setError(caught instanceof ApiError && caught.code === 'provider_configuration_required' ? 'provider' : caught instanceof ApiError && caught.status === 404 ? 'notFound' : 'failed');
      setBusy(false);
    }
  }
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
      <DialogTitle>{c.title}</DialogTitle>
      <DialogDescription>{c.desc}</DialogDescription>
      {cvs.status === 'error' || jobs.status === 'error' ? <p role="alert" className="text-sm text-destructive">{c.loadFailed}</p>
        : !ready ? <p role="status" className="text-sm text-muted-foreground">{c.loading}</p>
        : !usable.length ? <div className="grid gap-3 rounded-lg border border-dashed p-4"><p className="font-medium">{c.noCv}</p><p className="text-sm text-muted-foreground">{c.noCvBody}</p><Button asChild className="justify-self-start" onClick={onClose}><Link to={`${base}/profile`}>{c.addCv}</Link></Button></div>
        : <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
          <Field label={c.cv}><select className={selectClass} value={cv?.id ?? ''} onChange={event => setCvPick(event.target.value)} disabled={busy}>
            {usable.map(item => <option key={item.id} value={item.id}>{item.name} · v{item.latest_revision?.revision}</option>)}</select></Field>
          {cv?.latest_revision && <CvPreviewButton projectId={projectId} fileId={cv.latest_revision.file_id} name={cv.name} revision={cv.latest_revision.revision} filename={cv.latest_revision.original_filename} mimeType={cv.latest_revision.mime_type} variant="ghost" className="-mt-2 justify-self-start" />}
          <fieldset className="grid gap-3" disabled={busy}>
            <legend className="mb-1.5 text-sm font-medium">{c.job}</legend>
            {saved.length > 0 && <div className="flex flex-wrap gap-2" role="group">
              <Button type="button" size="sm" variant={effectiveMode === 'saved' ? 'default' : 'outline'} aria-pressed={effectiveMode === 'saved'} onClick={() => setMode('saved')}>{c.saved}</Button>
              <Button type="button" size="sm" variant={effectiveMode === 'new' ? 'default' : 'outline'} aria-pressed={effectiveMode === 'new'} onClick={() => setMode('new')}>{c.paste}</Button></div>}
            {effectiveMode === 'saved'
              ? <select aria-label={c.pick} className={selectClass} value={savedId} onChange={event => setSavedPick(event.target.value)}>{saved.map(item => <option key={item.id} value={item.id}>{item.title}{item.company ? ` · ${item.company}` : ''}</option>)}</select>
              : <div className="grid gap-3">
                <Field label={c.jtitle}><Input required maxLength={300} value={form.title} onChange={set('title')} /></Field>
                <Field label={c.company}><Input maxLength={300} value={form.company} onChange={set('company')} /></Field>
                <Field label={c.url}><Input type="url" maxLength={2048} value={form.source_url} onChange={set('source_url')} /></Field>
                <Field label={c.jdesc}><Textarea required rows={6} maxLength={50000} value={form.description} onChange={set('description')} /></Field></div>}
          </fieldset>
          {existing && <div role="alert" className="grid gap-2 rounded-lg border border-warning/50 p-3 text-sm"><p>{c.exists}</p><Button asChild size="sm" className="justify-self-start"><Link to={`${base}/sessions/${existing}`} onClick={onClose}>{c.open}</Link></Button></div>}
          {error === 'provider' && <div role="alert" className="grid gap-2 rounded-lg border border-warning/50 p-3 text-sm"><p>{c.provider}</p><Button asChild size="sm" className="justify-self-start"><Link to="/app/settings" onClick={onClose}>{c.settings}</Link></Button></div>}
          {(error === 'failed' || error === 'notFound') && <p role="alert" className="text-sm text-destructive">{error === 'notFound' ? c.notFound : c.failed}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>{c.cancel}</Button></DialogClose>
            <Button type="submit" disabled={busy || !valid}>{busy ? c.starting : c.start}</Button>
          </div>
        </form>}
    </DialogContent>
  </Dialog>;
}

// Button that owns its dialog; pages pass the job to preselect.
export function NewSessionButton({ projectId, job, cvName, children, ...props }: { projectId: string; job?: SessionJob; cvName?: string; children: ReactNode } & Omit<React.ComponentProps<typeof Button>, 'onClick'>) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" {...props} onClick={() => setOpen(true)}>{children}</Button>
    {open && <NewSessionDialog projectId={projectId} job={job} cvName={cvName} onClose={() => setOpen(false)} />}
  </>;
}
