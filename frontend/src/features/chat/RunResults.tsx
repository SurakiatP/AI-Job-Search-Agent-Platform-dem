import { AiMark } from '@/components/AiMark';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ChevronDown, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FitScore, fitBand } from '@/components/FitScore';
import { Progress } from '@/components/ui/progress';
import { Markdown } from '@/components/Markdown';
import { CopyButton } from '@/components/CopyButton';
import type { DocumentView, Locale, RunView, SkillCoverage } from '../../lib/api-types';

// Probe the download once (headers only, then abort) so a deleted document's file shows muted text instead of a broken link.
function ResultFile({ href, label, deleted }: { href: string; label: string; deleted: string }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(href, { credentials: 'same-origin', signal: controller.signal })
      .then(response => { if (response.status === 404) setGone(true); controller.abort(); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [href]);
  if (gone) return <p className="text-sm text-muted-foreground" data-testid="document-deleted">{deleted}</p>;
  return <Button asChild variant="outline" className="h-auto justify-start whitespace-normal py-2 text-left"><a href={href}><Download className="size-4" aria-hidden="true" />{label}</a></Button>;
}

function ReportBody({ markdown }: { markdown: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return <div className="border-t px-4 py-4"><div ref={ref}><Markdown data-testid="evaluation-report">{markdown}</Markdown></div><CopyButton className="mt-3" source={ref} markdown={markdown} /></div>;
}

const bandKey = { success: 'strong', warning: 'partial', danger: 'low', none: 'none' } as const;
const bandVariant = { success: 'success', warning: 'warning', danger: 'danger', none: 'secondary' } as const;

function SkillsFound({ coverage }: { coverage: SkillCoverage }) {
  const { t } = useTranslation('sessionWorkspace');
  return <section aria-label={t('result.skillsTitle')} className="grid min-w-0 content-start gap-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="min-w-0 break-words text-sm font-semibold">{t('result.skillsTitle')}</h3>
      <span className="text-2xl font-semibold tabular-nums">{t('result.skillsOf', { found: coverage.matched.length, total: coverage.required.length })}</span>
    </div>
    <Progress value={Math.round(coverage.ratio * 100)} />
    <p className="text-xs text-muted-foreground">{t('result.keyword')}</p>
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">{t('result.showEvidence')}<ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
      <div className="grid gap-3 pt-1">
        {coverage.matched.length > 0 && <div className="grid gap-1.5"><p className="text-xs font-medium text-muted-foreground">{t('result.found')}</p><ul className="flex flex-wrap gap-1.5">{coverage.matched.map(skill => <li key={skill}><Badge variant="success" className="break-all">{skill}</Badge></li>)}</ul></div>}
        {coverage.missing.length > 0 && <div className="grid gap-1.5"><p className="text-xs font-medium text-muted-foreground">{t('result.missing')}</p><ul className="flex flex-wrap gap-1.5">{coverage.missing.map(skill => <li key={skill}><Badge variant="outline" className="break-all">{skill}</Badge></li>)}</ul></div>}
      </div>
    </details>
  </section>;
}

// Only persisted documents are listed; a pending tailor proposal lives in the run payload and never appears here.
export function RelatedDocuments({ projectId, documents }: { projectId: string; documents: DocumentView[] }) {
  const { t } = useTranslation('sessionWorkspace');
  const id = useId();
  return <section aria-labelledby={id} className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
    <h2 id={id} className="text-lg font-semibold">{t('result.related')}</h2>
    {documents.length === 0 ? <p className="text-sm text-muted-foreground">{t('result.relatedNone')}</p> : <ul className="grid divide-y">{documents.map(document => <li key={document.id} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium"><span className="min-w-0 break-words">{document.title}</span>{document.latest_revision && <span className="text-sm font-normal text-muted-foreground">{t('result.version', { n: document.latest_revision.revision })}</span>}{document.partial && <Badge variant="warning" role="status">{t('result.partialDoc')}</Badge>}</p>
        {/* ponytail: raw markdown stripped of punctuation, not rendered; render markdown if previews need formatting */}
        {document.content_markdown && <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{document.content_markdown.replace(/[#>*_`~]/g, '')}</p>}
      </div>
      <Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline" to={`/app/projects/${projectId}/documents/${document.id}`}>{t('result.openDoc')}</Link>
    </li>)}</ul>}
  </section>;
}

export function RunResults({ projectId, locale, run, documents, trashedDocuments = [], showDocuments = true }: { projectId: string; locale: Locale; run: RunView | null; documents: DocumentView[]; trashedDocuments?: DocumentView[]; showDocuments?: boolean }) {
  const { t } = useTranslation('sessionWorkspace');
  const headingId = useId();
  if (!run) return null;
  const ownDocuments = documents.filter(document => document.source_run_id === run.id);
  const resultDocuments = showDocuments ? ownDocuments : [];
  const trashedHere = trashedDocuments.filter(document => document.source_run_id === run.id);
  const evaluation = run.evaluation_result;
  const band = evaluation ? fitBand(evaluation.score) : 'none';
  const report = t('result.report');
  const downloads = locale === 'th' ? 'ดาวน์โหลดไฟล์' : 'Download file';
  const noResult = locale === 'th' ? 'งานนี้ไม่มีผลลัพธ์ที่เผยแพร่' : 'This run has no published result yet.';
  const deletedText = locale === 'th' ? 'เอกสารถูกลบแล้ว' : 'Document deleted';
  const inTrashText = locale === 'th' ? 'อยู่ในถังขยะ' : 'In trash';
  const openTrash = locale === 'th' ? 'เปิดถังขยะ' : 'Open trash';
  const openDocument = t('result.openDoc');
  return <section aria-labelledby={headingId} className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
    <h2 id={headingId} className="text-lg font-semibold">{t('result.title')}</h2>
    {run.status !== 'completed' && <p role="status" className="text-sm text-muted-foreground">{locale === 'th' ? 'ผลลัพธ์ที่บันทึกไว้ · งานยังไม่เสร็จสมบูรณ์' : 'Preserved results · run is not complete'}</p>}
    {evaluation && <div className="grid gap-5">
      <div className="grid gap-5 md:grid-cols-2 md:gap-8">
        <div className="grid min-w-0 content-start gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><AiMark size="sm" />{t('result.aiFit')}</p>
          <div className="flex flex-wrap items-center gap-3"><FitScore score={evaluation.score} size="lg" locale={locale} /><Badge variant={bandVariant[band]}>{t(`result.bands.${bandKey[band]}`)}</Badge></div>
          <p className="text-sm text-muted-foreground">{t('result.notPrediction')}</p>
        </div>
        {evaluation.skill_coverage && <SkillsFound coverage={evaluation.skill_coverage} />}
      </div>
      <details open className="group rounded-lg border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span>{report}</span><ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ReportBody markdown={evaluation.report_markdown} />
      </details>
    </div>}
    {resultDocuments.map(document => <article key={document.id} className="grid gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 break-words font-semibold">{document.title}</h3>
        {document.partial && <Badge variant="warning" role="status">{locale === 'th' ? 'เอกสารยังไม่สมบูรณ์' : 'Partial document'}</Badge>}
      </div>
      {document.content_markdown && <Markdown className="max-h-96 overflow-auto">{document.content_markdown}</Markdown>}
      <Button asChild variant="outline" size="sm" className="justify-self-start"><Link to={`/app/projects/${projectId}/documents/${document.id}`}>{openDocument}</Link></Button>
    </article>)}
    {trashedHere.map(document => <p key={document.id} className="text-sm text-muted-foreground" data-testid="document-in-trash">{document.title} · {inTrashText} · <Link className="text-primary hover:underline" to={`/app/projects/${projectId}/documents?view=trash`}>{openTrash}</Link></p>)}
    {run.result_file_ids.map((fileId, index) => <ResultFile key={fileId} deleted={deletedText}
      href={`/api/v1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/download`}
      label={`${downloads}${run.result_file_ids.length > 1 ? ` ${index + 1}` : ''}`} />)}
    {!evaluation && ownDocuments.length === 0 && trashedHere.length === 0 && run.result_file_ids.length === 0 && <p className="text-sm text-muted-foreground">{noResult}</p>}
  </section>;
}
