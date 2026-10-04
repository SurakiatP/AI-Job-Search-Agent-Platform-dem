import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { EmptyPage, ErrorState, LoadingState, MissingResource } from '../projects/PageStates';
import { useResource } from '../projects/useResource';

type DocumentItem = { id: string; document_type: 'cv' | 'cover_letter' | 'other'; title: string; content_markdown?: string | null; output_language?: 'th' | 'en' | null; source_run_id?: string | null; partial?: boolean; latest_revision?: { id: string; revision: number } | null };
type DocumentRevision = { document_id: string; id?: string; revision?: number; created_at?: string; source_cv_revision_id?: string | null; source_job_revision_id?: string | null; file_id?: string | null; content_markdown?: string | null };
type CVRevision = { id: string; revision: number };

function documentTypeLabel(type: DocumentItem['document_type'], t: (key: string, options: { defaultValue: string }) => string) {
  const labels = { cv: ['pages.docTypeCv', 'CV'], cover_letter: ['pages.docTypeCoverLetter', 'Cover letter'], other: ['pages.docTypeOther', 'Other document'] } as const;
  const [key, fallback] = labels[type];
  return t(key, { defaultValue: fallback });
}

export function DocumentsPage() {
  const { t } = useTranslation();
  const { projectId = '' } = useParams();
  const result = useResource<DocumentItem[]>(`/projects/${projectId}/documents`);
  if (result.status === 'loading') return <LoadingState />;
  if (result.status === 'error') return <ErrorState onRetry={result.reload} />;
  const documents = result.data ?? [];
  if (!documents.length) return <EmptyPage title={t('pages.noDocumentsTitle', { defaultValue: 'No documents yet' })} description={t('pages.noDocumentsDescription', { defaultValue: 'Documents created for this project will appear here.' })} href={`/app/projects/${projectId}/profile`} action={t('pages.profileTitle', { defaultValue: 'Profile and CV' })} />;
  return <section className="page-wrap"><div className="page-heading"><div><h1>{t('pages.documentsTitle', { defaultValue: 'Documents' })}</h1></div></div><div className="card-grid">{documents.map(document => <article className="surface-card" key={document.id}><h2><Link to={`/app/projects/${projectId}/documents/${document.id}`}>{document.title}</Link></h2><p className="muted">{documentTypeLabel(document.document_type, t)}{document.latest_revision ? ` · ${t('pages.revision', { defaultValue: 'Revision' })} ${document.latest_revision.revision}` : ''}</p>{document.partial && <p className="partial-badge">{t('pages.partial', { defaultValue: 'Partial document' })}</p>}</article>)}</div></section>;
}

export function DocumentDetailPage() {
  const { t } = useTranslation();
  const { projectId = '', documentId = '' } = useParams();
  const docs = useResource<DocumentItem[]>(`/projects/${projectId}/documents`);
  const revisions = useResource<DocumentRevision[]>(`/projects/${projectId}/documents/${documentId}/revisions`);
  const cvRevisions = useResource<CVRevision[]>(`/projects/${projectId}/cv`);
  if (docs.status === 'loading') return <LoadingState />;
  if (docs.status === 'error') {
    if (docs.errorStatus === 404) return <MissingResource />;
    return <ErrorState onRetry={docs.reload} />;
  }
  const document = docs.data?.find(item => item.id === documentId);
  if (!document) return <MissingResource />;
  if (revisions.status === 'loading') return <LoadingState />;
  if (revisions.status === 'error') {
    if (revisions.errorStatus === 404) return <MissingResource />;
    return <ErrorState onRetry={revisions.reload} />;
  }
  const versions = revisions.data ?? [];
  const latestRevision = versions.find(revision => revision.id === document.latest_revision?.id) ?? versions.reduce<DocumentRevision | undefined>((latest, revision) => !latest || (revision.revision ?? 0) > (latest.revision ?? 0) ? revision : latest, undefined);
  const preview = document.content_markdown ?? latestRevision?.content_markdown ?? null;
  return <article className="page-wrap document-reading"><p className="eyebrow">{t('pages.documentsTitle', { defaultValue: 'Documents' })}</p><h1>{document.title}</h1><p>{documentTypeLabel(document.document_type, t)}</p>{document.output_language && <p data-testid="document-language">{t('pages.documentLanguage', { defaultValue: 'Document language' })}: {document.output_language === 'th' ? 'ไทย' : 'English'}</p>}{document.partial && <p className="partial-badge" role="status">{t('pages.partial', { defaultValue: 'Partial document' })}</p>}<ol className="revision-list">{versions.map((revision, index) => {
    const revisionNumber = revision.revision ?? index + 1;
    const sourceRevisionId = revision.source_cv_revision_id;
    const sourceRevision = sourceRevisionId && cvRevisions.status === 'ready'
      ? cvRevisions.data?.find(item => item.id === sourceRevisionId)
      : undefined;

    return <li key={revision.id ?? `${revision.document_id}-${index}`}><span>{t('pages.revision', { defaultValue: 'Revision' })} {revisionNumber}</span>{revision.created_at && <time dateTime={revision.created_at}>{new Date(revision.created_at).toLocaleDateString()}</time>}<p className="muted">
      {sourceRevision ? <span data-testid={`source-cv-revision-${revisionNumber}`}>{t('pages.sourceCVRevision', { revision: sourceRevision.revision, defaultValue: `CV revision ${sourceRevision.revision}` })}</span> : cvRevisions.status === 'loading' && sourceRevisionId ? <span data-testid={`source-cv-lookup-${revisionNumber}`}>{sourceRevisionId}</span> : <span data-testid="source-cv-unavailable">{t('pages.sourceCVUnavailable', { defaultValue: 'Source CV unavailable' })}{sourceRevisionId && <> · <code>{sourceRevisionId}</code></>}</span>}
      {' '}<Link to={`/app/projects/${projectId}/profile`}>{t('pages.openCVProfile', { defaultValue: 'Open CV profile' })}</Link>
    </p>{revision.file_id && <a href={`/api/v1/projects/${projectId}/files/${revision.file_id}/download`}>{t('pages.downloadDocument', { defaultValue: 'Download document' })}</a>}</li>;
  })}</ol><section className="surface-card"><h2>{t('pages.documentContent', { defaultValue: 'Document content' })}</h2><div className="plain-content" data-testid="document-content">{preview ?? t('pages.docPreviewUnavailable', { defaultValue: 'A text preview is unavailable. Download the authorized file to review this revision.' })}</div></section><Link className="button button-secondary" to={`/app/projects/${projectId}/jobs`}>{t('pages.jobsTitle', { defaultValue: 'Saved jobs' })}</Link></article>;
}
