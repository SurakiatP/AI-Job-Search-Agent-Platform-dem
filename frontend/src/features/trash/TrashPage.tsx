// One trash for the project: evaluations, documents and CVs in tabs, reusing each area's own trash view.
import { useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CVView, Locale, SessionView } from '@/lib/api-types';
import { notifyTrashChanged } from '@/lib/trash';
import { useResource } from '../projects/useResource';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { SessionTrash } from '../sessions/SessionTrash';
import { TrashView, type TrashedDocument } from '../documents/TrashView';
import { documentTypeLabel } from '../documents/DocumentsPage';
import { CvTrash } from './CvTrash';
import { Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

export function TrashPage() {
  const { projectId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const [params, setParams] = useSearchParams();
  const sessions = useResource<SessionView[]>(`/projects/${projectId}/sessions?view=trash`);
  const documents = useResource<TrashedDocument[]>(`/projects/${projectId}/documents/trash`);
  const cvs = useResource<CVView[]>(`/projects/${projectId}/cvs?view=trash`);
  // No ?tab=: open the first tab that has something in it (evaluations while any list is still loading).
  const loaded = !!sessions.data && !!documents.data && !!cvs.data;
  const firstFilled = !loaded ? 'evaluations' : sessions.data!.length ? 'evaluations' : documents.data!.length ? 'documents' : cvs.data!.length ? 'cvs' : 'evaluations';
  // Decided once, so emptying the open tab does not make the page jump.
  const picked = useRef<string | null>(null);
  if (loaded && !picked.current) picked.current = firstFilled;
  const settled = [sessions, documents, cvs].every(r => r.status !== 'loading' || r.data);
  const tab = (['evaluations', 'documents', 'cvs'] as const).find(name => name === params.get('tab')) ?? picked.current ?? 'evaluations';
  const changed = (reload: () => void) => () => { reload(); notifyTrashChanged(); };
  const count = (n?: number) => <span className="ms-1.5 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{n ?? 0}</span>;
  const tabClass = 'min-h-11 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none';
  return <section className="grid min-w-0 gap-6">
    <PageHeader icon={Trash2} title={t('trash.title')} lede={t('trash.subtitle')} />
    {!params.get('tab') && !settled ? <LoadingState /> : <Tabs value={tab} onValueChange={value => setParams({ tab: value }, { replace: true })} className="grid min-w-0 gap-4">
      <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0">
        <TabsTrigger value="evaluations" className={tabClass}>{t('nav.evaluate')}{count(sessions.data?.length)}</TabsTrigger>
        <TabsTrigger value="documents" className={tabClass}>{t('nav.documents')}{count(documents.data?.length)}</TabsTrigger>
        <TabsTrigger value="cvs" className={tabClass}>{t('trash.tabCvs')}{count(cvs.data?.length)}</TabsTrigger>
      </TabsList>
      <TabsContent value="evaluations">
        {sessions.status === 'loading' && !sessions.data ? <LoadingState /> : sessions.status === 'error' ? <ErrorState onRetry={sessions.reload} /> :
          <SessionTrash projectId={projectId} locale={locale} items={sessions.data ?? []} onChanged={changed(sessions.reload)} />}
      </TabsContent>
      <TabsContent value="documents">
        {documents.status === 'loading' && !documents.data ? <LoadingState /> : documents.status === 'error' ? <ErrorState onRetry={documents.reload} /> :
          <TrashView projectId={projectId} items={documents.data ?? []} typeLabel={type => documentTypeLabel(type, t)} onChanged={changed(documents.reload)} />}
      </TabsContent>
      <TabsContent value="cvs">
        {cvs.status === 'loading' && !cvs.data ? <LoadingState /> : cvs.status === 'error' ? <ErrorState onRetry={cvs.reload} /> :
          <CvTrash projectId={projectId} locale={locale} items={cvs.data ?? []} onChanged={changed(cvs.reload)} />}
      </TabsContent>
    </Tabs>}
  </section>;
}
