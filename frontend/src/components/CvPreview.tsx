import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import type { ExperienceKind, ExperienceView } from '../lib/api-types';
import { Download, Eye, FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

type Preview = { status: 'loading' } | { status: 'pdf'; url: string } | { status: 'text'; text: string } | { status: 'none' } | { status: 'error' };

const copy = {
  th: { open: 'ดูตัวอย่าง', close: 'ปิด', download: 'ดาวน์โหลด', loading: 'กำลังโหลดตัวอย่าง…', error: 'โหลดตัวอย่างไม่สำเร็จ ลองอีกครั้งหรือดาวน์โหลดไฟล์', read: 'สิ่งที่ AI อ่านได้จาก CV นี้', readNone: 'ยังไม่มีข้อมูลที่อ่านได้จาก CV นี้ เปิดคลังประสบการณ์เพื่ออ่านอีกครั้ง', readNote: 'เบราว์เซอร์แสดงไฟล์ชนิดนี้ไม่ได้ จึงแสดงข้อมูลที่ระบบอ่านได้แทน ดาวน์โหลดไฟล์ต้นฉบับได้ที่ปุ่มด้านบน', kinds: { experience: 'ประสบการณ์ทำงาน', education: 'การศึกษา', skill: 'ทักษะ', certification: 'ใบรับรอง', project: 'โปรเจกต์', other: 'อื่น ๆ', language: 'ภาษา', award: 'รางวัล', publication: 'ผลงานตีพิมพ์', volunteer: 'งานอาสาสมัคร', interest: 'ความสนใจ' } as Record<ExperienceKind, string>, version: 'เวอร์ชัน' },
  en: { open: 'Preview', close: 'Close', download: 'Download', loading: 'Loading preview…', error: 'Could not load the preview. Try again or download the file.', read: 'What AI read from this CV', readNone: 'Nothing read from this CV yet. Open the experience bank to read it again.', readNote: 'Your browser cannot show this file type, so here is what we read from it. Download the original with the button above.', kinds: { experience: 'Work experience', education: 'Education', skill: 'Skills', certification: 'Certifications', project: 'Projects', other: 'Other', language: 'Languages', award: 'Awards', publication: 'Publications', volunteer: 'Volunteering', interest: 'Interests' } as Record<ExperienceKind, string>, version: 'Version' },
};

const downloadUrl = (projectId: string, fileId: string) => `/v1/projects/${projectId}/files/${fileId}/download`;

export function useFilePreview(url: string | null, mimeType: string) {
  const [preview, setPreview] = useState<Preview>({ status: 'loading' });
  useEffect(() => {
    if (!url) return;
    const pdf = mimeType === 'application/pdf', text = mimeType.startsWith('text/');
    if (!pdf && !text) { setPreview({ status: 'none' }); return; }
    let objectUrl: string | null = null, live = true;
    setPreview({ status: 'loading' });
    fetch(url, { credentials: 'same-origin', cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error(String(response.status)); return response.blob(); })
      .then(async blob => {
        if (!live) return;
        if (text) { setPreview({ status: 'text', text: await blob.text() }); return; }
        // Retype the blob so the browser's own PDF viewer renders it inline instead of downloading.
        objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        setPreview({ status: 'pdf', url: objectUrl });
      })
      .catch(() => { if (live) setPreview({ status: 'error' }); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, mimeType]);
  return preview;
}

// Files the browser cannot render: show the facts read from this CV instead of a dead end.
function ReadFacts({ projectId, cvId, name, c }: { projectId: string; cvId: string | null | undefined; name: string; c: typeof copy.en }) {
  const [view, setView] = useState<ExperienceView | 'error' | null>(null);
  useEffect(() => {
    let live = true;
    apiRequest<ExperienceView>(`/projects/${projectId}/experience`).then(v => { if (live) setView(v); }).catch(() => { if (live) setView('error'); });
    return () => { live = false; };
  }, [projectId]);
  const box = 'grid size-full place-items-center rounded-lg border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground';
  if (view === 'error') return <div role="alert" className={box}>{c.error}</div>;
  if (!view) return <div role="status" className={box}>{c.loading}</div>;
  const items = view.items.filter(i => cvId ? i.source_cv_id === cvId : i.source_cv_name === name);
  const groups = [...new Set(items.map(i => i.kind))];
  return <div className="size-full overflow-auto rounded-lg border bg-background p-5 sm:p-6">
    <h3 className="text-base font-semibold">{c.read}</h3>
    <p className="mt-1 text-sm text-muted-foreground">{items.length ? c.readNote : c.readNone}</p>
    {groups.map(kind => <section key={kind} className="mt-4"><h4 className="text-sm font-semibold">{c.kinds[kind]}</h4>
      <ul className="mt-1 grid list-disc gap-1 ps-5 text-sm">{items.filter(i => i.kind === kind).map(i => <li key={i.id} className="break-words [overflow-wrap:anywhere]">{i.text}</li>)}</ul></section>)}
  </div>;
}

export function PreviewBody({ url, mimeType, title, c, projectId, cvId }: { url: string; mimeType: string; title: string; c: typeof copy.en; projectId?: string; cvId?: string | null }) {
  const preview = useFilePreview(url, mimeType);
  if (preview.status === 'pdf') return <iframe title={title} src={`${preview.url}#view=FitH&toolbar=1`} className="size-full rounded-lg border bg-white" />;
  if (preview.status === 'text') return <pre className="size-full overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-6 font-sans text-base leading-relaxed">{preview.text}</pre>;
  if (preview.status === 'none' && projectId) return <ReadFacts projectId={projectId} cvId={cvId} name={title} c={c} />;
  const message = preview.status === 'loading' ? c.loading : c.error;
  return <div className="grid size-full place-items-center rounded-lg border border-dashed bg-muted/40 p-6 text-center" role={preview.status === 'error' ? 'alert' : 'status'}>
    <div className="grid justify-items-center gap-3 text-muted-foreground">
      <FileText className={preview.status === 'loading' ? 'size-10 animate-pulse' : 'size-10'} aria-hidden="true" />
      <p className="max-w-sm text-sm">{message}</p>
    </div>
  </div>;
}

export function CvPreviewButton({ projectId, fileId, name, revision, filename, mimeType, cvId, size = 'sm', variant = 'outline', className }: {
  projectId: string; fileId: string | null | undefined; name: string; revision?: number | null; filename?: string; mimeType?: string; cvId?: string | null;
  size?: 'sm' | 'default'; variant?: 'outline' | 'ghost' | 'default'; className?: string;
}) {
  const { i18n } = useTranslation();
  const c = i18n.language.startsWith('th') ? copy.th : copy.en;
  const [open, setOpen] = useState(false);
  if (!fileId) return null;
  const url = downloadUrl(projectId, fileId);
  const type = mimeType ?? (filename?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : filename?.toLowerCase().endsWith('.txt') ? 'text/plain' : 'application/pdf');
  const subtitle = [revision ? `${c.version} ${revision}` : null, filename].filter(Boolean).join(' · ');
  return <>
    <Button type="button" size={size} variant={variant} className={className} onClick={() => setOpen(true)}><Eye className="size-4" aria-hidden="true" />{c.open}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <DialogContent className="flex h-[min(92dvh,1100px)] max-w-4xl flex-col gap-3 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="break-words">{name}</DialogTitle>
            {subtitle && <DialogDescription className="mt-0.5">{subtitle}</DialogDescription>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild size="sm" variant="outline"><a href={url}><Download className="size-4" aria-hidden="true" />{c.download}</a></Button>
            <DialogClose asChild><Button type="button" size="sm" variant="ghost" aria-label={c.close}><X className="size-4" aria-hidden="true" /></Button></DialogClose>
          </div>
        </div>
        <div className="min-h-0 flex-1"><PreviewBody url={url} mimeType={type} title={name} c={c} projectId={projectId} cvId={cvId} /></div>
      </DialogContent>}
    </Dialog>
  </>;
}
