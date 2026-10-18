import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDraft } from '../../app/drafts';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { PageBack } from '../../components/PageBack';
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
  const pending = useRef(false);
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
      navigate(`/app/projects/${project.id}/overview`);
    } catch (caught) { setFailed(caught instanceof ApiError && caught.status === 409 ? 'taken' : 'uncertain'); }
    finally { pending.current = false; setSaving(false); }
  }
  return <section className="mx-auto grid w-full max-w-2xl gap-6"><PageBack to="/app/projects">{t('pages.backProjects')}</PageBack><h1>{t('pages.newProject')}</h1>
    <form className="workspace-panel grid gap-5 p-5 sm:p-6" onSubmit={event => { event.preventDefault(); void submit(); }} noValidate>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="project-name">{t('pages.projectName')}</label>
        <Input id="project-name" autoComplete="off" value={name} onChange={event => { setName(event.target.value); if (failed === 'taken') setFailed(null); }} aria-invalid={!!error} aria-describedby={error ? 'project-name-error project-name-hint' : 'project-name-hint'} />
        <p id="project-name-hint" className="text-sm text-muted-foreground">{c.nameHint(name.length)}</p>
        {error && <span className="field-error text-sm" id="project-name-error" role="alert">{error}</span>}
      </div>
      <div className="grid gap-2 border-t pt-4"><h2 className="text-base font-semibold">{c.nextTitle}</h2><ol className="grid list-decimal gap-1 ps-5 text-sm text-muted-foreground">{c.next.map(step => <li key={step}>{step}</li>)}</ol></div>
      {failed === 'uncertain' && <div className="field-error" role="alert"><p>{t('workspace.creationUncertain')}</p><Link className="underline" to="/app/projects">{t('nav.allProjects')}</Link></div>}
      <div className="flex flex-wrap gap-3"><Button type="submit" busy={saving} disabled={saving}>{saving ? t('pages.loading') : t('pages.createProject')}</Button><Button asChild variant="outline"><Link to="/app/projects">{c.cancel}</Link></Button></div>
    </form></section>;
}
