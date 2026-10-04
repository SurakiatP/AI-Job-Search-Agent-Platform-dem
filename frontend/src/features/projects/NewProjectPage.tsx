import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDraft } from '../../app/drafts';
import { Button } from '../../components/Button';
import { sendJson } from './useResource';

type Project = { id: string };
type Session = { id: string };

export function NewProjectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useDraft('', 'new-project', 'name');
  const [goal, setGoal] = useDraft('', 'new-project', 'goal');
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  async function submit() {
    if (!name.trim() || !goal.trim()) { setInvalid(true); return; }
    setInvalid(false); setFailed(false); setSaving(true);
    try {
      const project = await sendJson<Project>('/projects', 'POST', { name: name.trim() });
      const session = await sendJson<Session>(`/projects/${project.id}/sessions`, 'POST', { title: 'New session' });
      navigate(`/app/projects/${project.id}/profile`, { state: { initialSessionId: session.id, initialGoal: goal.trim() } });
    } catch { setFailed(true); }
    finally { setSaving(false); }
  }
  return <section className="form-page"><Link to="/app/projects">{t('pages.backProjects', { defaultValue: 'Back to projects' })}</Link><h1>{t('pages.newProject', { defaultValue: 'New project' })}</h1><form onSubmit={event => { event.preventDefault(); void submit(); }} noValidate>
    <label htmlFor="project-name">{t('pages.projectName', { defaultValue: 'Project name' })}</label><input id="project-name" maxLength={200} autoComplete="off" value={name} onChange={event => setName(event.target.value)} aria-invalid={invalid && !name.trim()} aria-describedby={invalid && !name.trim() ? 'project-name-error' : undefined} />{invalid && !name.trim() && <span className="field-error" id="project-name-error">{t('pages.projectNameRequired', { defaultValue: 'Enter a project name.' })}</span>}
    <label htmlFor="project-goal">{t('pages.projectGoal', { defaultValue: 'What are you looking for?' })}</label><textarea id="project-goal" maxLength={2000} rows={4} value={goal} onChange={event => setGoal(event.target.value)} aria-invalid={invalid && !goal.trim()} aria-describedby={invalid && !goal.trim() ? 'project-goal-error' : undefined} />{invalid && !goal.trim() && <span className="field-error" id="project-goal-error">{t('pages.projectGoalRequired', { defaultValue: 'Describe the role or goal you want to work toward.' })}</span>}
    {failed && <p className="field-error" role="alert">{t('pages.loadError', { defaultValue: 'We could not load this information.' })}</p>}<Button type="submit" variant="primary" disabled={saving}>{saving ? t('pages.loading', { defaultValue: 'Loading…' }) : t('pages.createProject', { defaultValue: 'Create a project' })}</Button>
  </form></section>;
}
