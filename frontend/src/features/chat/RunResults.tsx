import { Link } from 'react-router';
import { ChevronDown, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FitScore } from '@/components/FitScore';
import { SkillCoverage } from '@/components/SkillCoverage';
import { Markdown } from '@/components/Markdown';
import type { DocumentView, Locale, RunView } from '../../lib/api-types';

export function RunResults({ projectId, locale, run, documents }: { projectId: string; locale: Locale; run: RunView | null; documents: DocumentView[] }) {
  if (!run) return null;
  const resultDocuments = documents.filter(document => document.source_run_id === run.id);
  const evaluation = run.evaluation_result;
  const label = locale === 'th' ? 'ผลลัพธ์' : 'Results';
  const report = locale === 'th' ? 'รายงานประเมิน' : 'Evaluation report';
  const downloads = locale === 'th' ? 'ดาวน์โหลดไฟล์' : 'Download file';
  const noResult = locale === 'th' ? 'งานนี้ไม่มีผลลัพธ์ที่เผยแพร่' : 'This run has no published result yet.';
  const openDocument = locale === 'th' ? 'เปิดเอกสาร' : 'Open document';
  return <Card role="region" aria-labelledby="run-results-heading">
    <CardHeader className="pb-3"><CardTitle id="run-results-heading" className="text-lg">{label}</CardTitle></CardHeader>
    <CardContent className="grid gap-4">
      {run.status !== 'completed' && <p role="status" className="text-sm text-muted-foreground">{locale === 'th' ? 'ผลลัพธ์ที่บันทึกไว้ · งานยังไม่เสร็จสมบูรณ์' : 'Preserved results · run is not complete'}</p>}
      {evaluation && <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-4"><FitScore score={evaluation.score} size="lg" locale={locale} /><h3 className="min-w-0 break-words text-base font-semibold">{report}</h3></div>
        <SkillCoverage coverage={evaluation.skill_coverage} locale={locale} className="rounded-lg border p-4" />
        <details open className="group rounded-lg border">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>{report}</span><ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <Markdown className="border-t px-4 py-4" data-testid="evaluation-report">{evaluation.report_markdown}</Markdown>
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
      {run.result_file_ids.map((fileId, index) => <Button key={fileId} asChild variant="outline" className="h-auto justify-start whitespace-normal py-2 text-left">
        <a href={`/api/v1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/download`}><Download className="size-4" aria-hidden="true" />{downloads}{run.result_file_ids.length > 1 ? ` ${index + 1}` : ''}</a>
      </Button>)}
      {!evaluation && resultDocuments.length === 0 && run.result_file_ids.length === 0 && <p className="text-sm text-muted-foreground">{noResult}</p>}
    </CardContent>
  </Card>;
}
