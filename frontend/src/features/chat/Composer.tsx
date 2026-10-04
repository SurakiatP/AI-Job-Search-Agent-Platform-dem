import type { FormEvent } from 'react';
import type { JobRevisionView, Locale, RunOperation } from '../../lib/api-types';
import { Button } from '../../components/Button';

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

  return <form className="chat-composer" onSubmit={submit}>
    {jobs.length > 0 ? <>
      <label htmlFor="workflow-job">{text.job}</label>
      <select id="workflow-job" name="job" defaultValue={selectedJob?.id} disabled={busy}>
        {jobs.map(job => <option key={job.id} value={job.id}>{job.title} · {job.company ?? `#${job.revision}`}</option>)}
      </select>
      <label htmlFor="workflow-operation">{text.operation}</label>
      <select id="workflow-operation" name="operation" defaultValue="evaluate_job" disabled={busy}>
        <option value="evaluate_job">{text.evaluate}</option>
        <option value="draft_documents">{text.draft}</option>
      </select>
      <label htmlFor="workflow-output-language">{text.language}</label>
      <select id="workflow-output-language" name="output_language" defaultValue={locale} disabled={busy}>
        <option value="th">{text.th}</option>
        <option value="en">{text.en}</option>
      </select>
      <label htmlFor="assistant-message">{text.message}</label>
      <textarea id="assistant-message" className="chat-text" value={message} onChange={event => onMessageChange(event.target.value)} rows={4} maxLength={4000} disabled={busy} />
      <Button type="submit" variant="primary" disabled={busy || !message.trim()}>{text.send}</Button>
    </> : <p className="muted">{text.noJobs}</p>}
  </form>;
}
