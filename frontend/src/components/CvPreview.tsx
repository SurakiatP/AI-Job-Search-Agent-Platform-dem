import { useEffect, useState } from 'react';
import { Download, Eye, FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

type Preview = { status: 'loading' } | { status: 'pdf'; url: string } | { status: 'text'; text: string } | { status: 'none' } | { status: 'error' };

const copy = {
  th: { open: 'ดูตัวอย่าง', close: 'ปิด', download: 'ดาวน์โหลด', loading: 'กำลังโหลดตัวอย่าง…', error: 'โหลดตัวอย่างไม่สำเร็จ ลองอีกครั้งหรือดาวน์โหลดไฟล์', none: 'ไฟล์ประเภทนี้ดูตัวอย่างในเบราว์เซอร์ไม่ได้ ดาวน์โหลดเพื่อเปิดดู', version: 'เวอร์ชัน' },
  en: { open: 'Preview', close: 'Close', download: 'Download', loading: 'Loading preview…', error: 'Could not load the preview. Try again or download the file.', none: 'This file type cannot be previewed in the browser. Download it to open.', version: 'Version' },
};

const downloadUrl = (projectId: string, fileId: string) => `/api/v1/projects/${projectId}/files/${fileId}/download`;

function useFilePreview(url: string | null, mimeType: string) {
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

function PreviewBody({ url, mimeType, title, c }: { url: string; mimeType: string; title: string; c: typeof copy.en }) {
  const preview = useFilePreview(url, mimeType);
  if (preview.status === 'pdf') return <iframe title={title} src={`${preview.url}#view=FitH&toolbar=1`} className="size-full rounded-lg border bg-white" />;
  if (preview.status === 'text') return <pre className="size-full overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-6 font-sans text-base leading-relaxed">{preview.text}</pre>;
  const message = preview.status === 'loading' ? c.loading : preview.status === 'none' ? c.none : c.error;
  return <div className="grid size-full place-items-center rounded-lg border border-dashed bg-muted/40 p-6 text-center" role={preview.status === 'error' ? 'alert' : 'status'}>
    <div className="grid justify-items-center gap-3 text-muted-foreground">
      <FileText className={preview.status === 'loading' ? 'size-10 animate-pulse' : 'size-10'} aria-hidden="true" />
      <p className="max-w-sm text-sm">{message}</p>
    </div>
  </div>;
}

export function CvPreviewButton({ projectId, fileId, name, revision, filename, mimeType, size = 'sm', variant = 'outline', className }: {
  projectId: string; fileId: string | null | undefined; name: string; revision?: number | null; filename?: string; mimeType?: string;
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
      {open && <DialogContent className="flex h-[min(92dvh,1100px)] max-w-4xl flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="break-words">{name}</DialogTitle>
            {subtitle && <DialogDescription className="mt-0.5">{subtitle}</DialogDescription>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button asChild size="sm" variant="outline"><a href={url}><Download className="size-4" aria-hidden="true" />{c.download}</a></Button>
            <DialogClose asChild><Button type="button" size="sm" variant="ghost" aria-label={c.close}><X className="size-4" aria-hidden="true" /></Button></DialogClose>
          </div>
        </div>
        <div className="min-h-0 flex-1"><PreviewBody url={url} mimeType={type} title={name} c={c} /></div>
      </DialogContent>}
    </Dialog>
  </>;
}
