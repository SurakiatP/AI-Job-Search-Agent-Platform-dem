import type { DocumentView, Locale, RunView } from '../../lib/api-types';

export function RunResults({ projectId, locale, run, documents }: { projectId: string; locale: Locale; run: RunView | null; documents: DocumentView[] }) {
  if (!run) return null;
  const resultDocuments = documents.filter(document => document.source_run_id === run.id);
  const evaluation = run.evaluation_result;
  const label = locale === 'th' ? 'ผลลัพธ์' : 'Results';
  const report = locale === 'th' ? 'รายงานประเมิน' : 'Evaluation report';
  const downloads = locale === 'th' ? 'ดาวน์โหลดเอกสาร' : 'Download documents';
  const noResult = locale === 'th' ? 'งานนี้ไม่มีผลลัพธ์ที่เผยแพร่' : 'This run has no published result yet.';
  return <section className="surface-card" aria-labelledby="run-results-heading">
    <h2 id="run-results-heading">{label}</h2>
    {run.status !== 'completed' && <p role="status">{locale === 'th' ? 'ผลลัพธ์ที่บันทึกไว้ · งานยังไม่เสร็จสมบูรณ์' : 'Preserved results · run is not complete'}</p>}
    {evaluation && <><h3>{report}{evaluation.score !== null ? ` · ${evaluation.score}/5` : ''}</h3><pre className="plain-content" data-testid="evaluation-report">{evaluation.report_markdown}</pre></>}
    {resultDocuments.map(document => <article key={document.id}>
      <h3>{document.title}</h3>
      {document.partial && <p role="status">{locale === 'th' ? 'เอกสารยังไม่สมบูรณ์' : 'Partial document'}</p>}
      {document.content_markdown && <pre className="plain-content">{document.content_markdown}</pre>}
    </article>)}
    {run.result_file_ids.map(fileId => <p key={fileId}><a href={`/api/v1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/download`}>{downloads} · {fileId}</a></p>)}
    {!evaluation && resultDocuments.length === 0 && run.result_file_ids.length === 0 && <p className="muted">{noResult}</p>}
  </section>;
}
