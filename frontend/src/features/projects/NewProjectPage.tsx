import { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDraft } from '../../app/drafts';
import { Alert } from '@/components/ui/alert';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { PageBack } from '../../components/PageBack';
import { apiRequest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';
import { useProjectCopy } from './copy';
import { sendJson } from './useResource';

type Project = { id: string };
const MAX = 200;

export function NewProjectPage() {
  const { t } = useTranslation();
  const { c } = useProjectCopy();
  const navigate = useNavigate();
  const [name, setName] = useDraft('', 'new-project', 'name');
  const w = (key: string) => t(`profile.${key}`, { ns: 'materialsWorkspace' });
  const pending = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<'taken' | 'uncertain' | null>(null);
  const trimmed = name.trim();
  const error = name.length > MAX ? c.nameTooLong : submitted && !trimmed ? t('pages.projectNameRequired') : failed === 'taken' ? c.nameTaken : '';
  async function submit() {
    if (pending.current) return;
    setSubmitted(true);
    if (!trimmed || trimmed.length > MAX) return;
    pending.current = true;
    setFailed(null); setSaving(true);
    try {
      const project = await sendJson<Project>('/projects', 'POST', { name: trimmed });
      setName('');
      if (!file) { navigate(`/app/projects/${project.id}/overview`); return; }
      // The CV page shows the upload being read, and lets the person retry if this upload fails.
      try { const body = new FormData(); body.set('file', file); await apiRequest(`/projects/${project.id}/cvs`, { method: 'POST', body }); } catch { /* retry happens on the CV page */ }
      navigate(`/app/projects/${project.id}/profile`);
    } catch (caught) { setFailed(caught instanceof ApiError && caught.status === 409 ? 'taken' : 'uncertain'); }
    finally { pending.current = false; setSaving(false); }
  }
  return <section className="mx-auto grid w-full max-w-2xl gap-6 lg:gap-8"><PageBack to="/app/projects">{t('pages.backProjects')}</PageBack><h1>{t('pages.newProject')}</h1>
    <form className="workspace-panel grid gap-4 p-5 sm:p-6" onSubmit={event => { event.preventDefault(); void submit(); }} noValidate>
      <div className="grid gap-2">
        <div className="mui-field"><Input id="project-name" placeholder=" " autoComplete="off" value={name} onChange={event => { setName(event.target.value); if (failed === 'taken') setFailed(null); }} aria-invalid={!!error} aria-describedby={error ? 'project-name-error project-name-hint' : 'project-name-hint'} /><label className="mui-label" htmlFor="project-name">{t('pages.projectName')}</label></div>
        <p id="project-name-hint" className="text-sm text-muted-foreground">{c.nameHint(name.length)}</p>
        {error && <span className="field-error text-sm" id="project-name-error" role="alert">{error}</span>}
      </div>
      <div className="grid gap-2">
        <input ref={fileInput} className="sr-only" tabIndex={-1} aria-label={w('newCv')} type="file" accept=".pdf,.docx,.txt" onChange={event => { const next = event.target.files?.[0] ?? null; event.target.value = ''; const ok = !next || (next.size <= 20 * 1024 * 1024 && ['pdf', 'docx', 'txt'].includes(next.name.split('.').pop()?.toLowerCase() ?? '')); setFileError(!ok); if (ok) setFile(next); }} />
        {file
          ? <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm"><FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{file.name}</span><Button type="button" variant="ghost" size="icon" aria-label={w('newCvRemove')} onClick={() => setFile(null)}><X className="size-4" aria-hidden="true" /></Button></div>
          : <Button type="button" variant="outline" className="w-fit" onClick={() => fileInput.current?.click()}><Upload className="size-4" aria-hidden="true" />{w('newCv')}</Button>}
        <p className="text-sm text-muted-foreground">{w('newCvHint')}</p>
        {fileError && <span className="field-error text-sm" role="alert">{w('newCvInvalid')}</span>}
      </div>
      <div className="grid gap-2 border-t pt-4"><h2 className="text-base font-semibold">{c.nextTitle}</h2><ol className="grid list-decimal gap-1 ps-5 text-sm text-muted-foreground">{c.next.map(step => <li key={step}>{step}</li>)}</ol></div>
      {failed === 'uncertain' && <Alert severity="error"><p>{t('workspace.creationUncertain')}</p><Link className="font-medium text-primary underline underline-offset-4" to="/app/projects">{t('nav.allProjects')}</Link></Alert>}
      <div className="flex flex-wrap gap-3"><Button type="submit" busy={saving} disabled={saving}>{saving ? t('pages.loading') : t('pages.createProject')}</Button><Button asChild variant="outline"><Link to="/app/projects">{c.cancel}</Link></Button></div>
    </form></section>;
}
