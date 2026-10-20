// Sidebar "ซ้อมสัมภาษณ์" (CR-IVP-01 FR-IVP-19): every practice set in the project, grouped by job. Sets are created in a session.
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { BusyNote } from '@/components/BusyNote';
import type { Locale, ProjectPracticeSet } from '@/lib/api-types';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { useResource } from '../projects/useResource';
import { Progress } from './PracticeTab';
import { practiceCopy } from './copy';

export function PracticeHubPage() {
  const { projectId = '' } = useParams();
  const { i18n } = useTranslation();
  const locale: Locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = practiceCopy[locale];
  const sets = useResource<ProjectPracticeSet[]>(`/projects/${projectId}/practice-sets`);
  const base = `/app/projects/${projectId}`;
  if (sets.status === 'loading' && !sets.data) return <LoadingState />;
  if (sets.status === 'error') return <ErrorState onRetry={sets.reload} />;
  const groups = new Map<string, ProjectPracticeSet[]>();
  for (const set of sets.data ?? []) groups.set(set.session_id, [...(groups.get(set.session_id) ?? []), set]);
  return <section className="grid min-w-0 gap-6">
    <header className="workspace-page-header"><div><h1>{c.hubTitle}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{c.hubIntro}</p></div></header>
    {groups.size === 0 ? <div className="workspace-panel grid justify-items-start gap-3 p-6 sm:p-8">
      <p className="max-w-xl text-muted-foreground">{c.hubEmpty}</p>
      <Button asChild className="min-h-11"><Link to={`${base}/sessions`}>{c.goEvaluations}</Link></Button>
    </div> : [...groups.values()].map(list => {
      const job = [list[0].job_title, list[0].job_company].filter(Boolean).join(' · ') || c.title;
      return <section key={list[0].session_id} aria-label={job} className="grid gap-3">
        <h2 className="break-words text-lg font-semibold"><Link className="hover:text-primary hover:underline" to={`${base}/sessions/${list[0].session_id}?tab=practice`}>{job}</Link></h2>
        <ul className="workspace-panel divide-y overflow-hidden">{list.map(set => <li key={set.id} className="grid min-w-0 gap-1.5 px-4 py-3 sm:px-6">
          <Link to={`${base}/sessions/${set.session_id}/practice/${set.id}`} className="w-fit break-words font-semibold hover:text-primary hover:underline [overflow-wrap:anywhere]">{set.name}</Link>
          <p className="text-sm text-muted-foreground">{c.levels[set.level]} · {set.sections.map(s => c.sections[s.id]).join(', ')}</p>
          {set.status === 'generating' ? <BusyNote label={c.generating} /> : set.status === 'failed' ? <p className="text-sm text-destructive">{c.failed}</p>
            : <Progress value={set.ready_count + set.known_count} max={set.question_count} label={c.progress(set.ready_count + set.known_count, set.question_count)} />}
        </li>)}</ul>
      </section>;
    })}
  </section>;
}
