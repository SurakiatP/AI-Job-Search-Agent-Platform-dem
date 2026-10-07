import type { FormEvent } from 'react';
import type { JobRevisionView, Locale, RunOperation } from '../../lib/api-types';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const selectClass = 'flex min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

type Props = {
  locale: Locale;
  jobs: JobRevisionView[];
  message: string;
  onMessageChange: (value: string) => void;
  onSubmit: (value: { message: string; operation: RunOperation; job: JobRevisionView; outputLanguage: Locale }) => void;
  busy?: boolean;
  initialJobId?: string;
};

export function Composer({ locale, jobs, message, onMessageChange, onSubmit, busy = false, initialJobId }: Props) {
  const text = locale === 'th'
    ? { job: 'ประกาศงานที่บันทึกไว้', operation: 'งานที่ต้องการ', evaluate: 'ประเมินความเหมาะสม', draft: 'ร่างเอกสารสมัครงาน', language: 'ภาษาผลลัพธ์', message: 'คำแนะนำสำหรับงานนี้ (ใช้ในการประเมินหรือร่างเอกสาร)', send: 'เริ่มงาน', noJobs: 'เพิ่มประกาศงานก่อนเริ่ม', th: 'ไทย', en: 'English' }
    : { job: 'Saved job posting', operation: 'Requested work', evaluate: 'Evaluate fit', draft: 'Draft application documents', language: 'Output language', message: 'Instructions for this task (used for evaluation or drafting)', send: 'Start run', noJobs: 'Add a saved job before starting', th: 'ไทย', en: 'English' };
  const selectedJob = jobs.find(job => job.id === initialJobId) ?? jobs[0];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedJob || busy || !message.trim()) return;
    const form = new FormData(event.currentTarget);
    onSubmit({
      message,
      operation: form.get('operation') === 'draft_documents' ? 'draft_documents' : 'evaluate_job',
      job: jobs.find(job => job.id === form.get('job')) ?? selectedJob,
      outputLanguage: form.get('output_language') === 'en' ? 'en' : 'th',
    });
  }

  return <Card className="sticky bottom-2 z-10 shadow-md"><form className="grid gap-3 p-4" onSubmit={submit}>
    {jobs.length > 0 ? <>
      <div className="grid gap-1.5">
        <Label htmlFor="workflow-job">{text.job}</Label>
        <select id="workflow-job" name="job" className={selectClass} defaultValue={selectedJob?.id} disabled={busy}>
          {jobs.map(job => <option key={job.id} value={job.id}>{job.title} · {job.company ?? `#${job.revision}`}</option>)}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="workflow-operation">{text.operation}</Label>
          <select id="workflow-operation" name="operation" className={selectClass} defaultValue="evaluate_job" disabled={busy}>
            <option value="evaluate_job">{text.evaluate}</option>
            <option value="draft_documents">{text.draft}</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="workflow-output-language">{text.language}</Label>
          <select id="workflow-output-language" name="output_language" className={selectClass} defaultValue={locale} disabled={busy}>
            <option value="th">{text.th}</option>
            <option value="en">{text.en}</option>
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="assistant-message">{text.message}</Label>
        <Textarea id="assistant-message" className="chat-text max-h-64 [field-sizing:content]" value={message} onChange={event => onMessageChange(event.target.value)} rows={3} maxLength={4000} disabled={busy} />
      </div>
      <Button type="submit" className="justify-self-end" disabled={busy || !message.trim()}><Send className="size-4" aria-hidden="true" />{text.send}</Button>
    </> : <p className="text-sm text-muted-foreground">{text.noJobs}</p>}
  </form></Card>;
}
