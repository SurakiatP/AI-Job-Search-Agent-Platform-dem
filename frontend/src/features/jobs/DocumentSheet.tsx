import { useRef } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Download, X } from 'lucide-react';
import { AiLabel } from '@/components/AiMark';
import { CopyButton } from '@/components/CopyButton';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { DocumentView } from '../../lib/api-types';
import { useResource } from '../projects/useResource';

type Revision = { revision: number; content_markdown?: string | null; file_id?: string | null };

// CH-09: a drafted document opens beside the job (full screen on a phone) so the person never leaves the job page to read it.
export function DocumentSheet({ projectId, doc, onClose }: { projectId: string; doc: DocumentView | null; onClose: () => void }) {
  const { t } = useTranslation('applicationsWorkspace');
  const ref = useRef<HTMLDivElement>(null);
  const revisions = useResource<Revision[]>(doc ? `/projects/${projectId}/documents/${doc.id}/revisions` : null);
  const latest = [...(revisions.data ?? [])].sort((a, b) => b.revision - a.revision)[0];
  const content = doc?.content_markdown ?? latest?.content_markdown ?? null;
  return <Dialog open={doc !== null} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent data-testid="document-sheet" className="inset-y-0 left-auto right-0 h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 content-start rounded-none p-4 sm:max-w-xl sm:rounded-s-xl sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-2">
          <DialogTitle className="break-words">{doc?.title}</DialogTitle>
          <AiLabel check />
        </div>
        <DialogClose asChild><Button type="button" variant="ghost" size="icon" aria-label={t('closePanel')}><X className="size-4" aria-hidden="true" /></Button></DialogClose>
      </div>
      <DialogDescription className="sr-only">{t('documentPanelHint')}</DialogDescription>
      {content ? <div ref={ref} className="min-w-0 rounded-lg border bg-background p-4"><Markdown>{content}</Markdown></div> : <p className="text-sm text-muted-foreground">{revisions.status === 'loading' ? t('loadingDocument') : t('noPreview')}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {latest?.file_id && <Button asChild variant="outline"><a href={`/v1/projects/${projectId}/files/${latest.file_id}/download`}><Download className="size-4" aria-hidden="true" />{t('downloadDocument')}</a></Button>}
        {content && <CopyButton source={ref} markdown={content} />}
        {doc && <Button asChild variant="ghost"><Link to={`/app/projects/${projectId}/documents/${doc.id}`}>{t('openFullPage')}</Link></Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
