import { useState } from 'react';
import { CheckCircle2, Compass, Info, Search, Upload } from 'lucide-react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { readPreference, savePreference } from '../../app/theme';
import { useOverviewCopy } from './copy';
import { BuildCvButton } from '../builder/BuildCvButton';

type Props = { base: string; cv: { name: string; version: number } | null; job: { title: string; more: number } | null };

const STEP_STAGE = ['cv', 'search', 'evaluate'];

// First-run guide: only the next unfinished step gets the primary button; later steps say what they wait for.
export function GettingStarted({ base, cv, job }: Props) {
  const { t } = useTranslation();
  const c = useOverviewCopy();
  const done = [!!cv, !!job, false];
  const next = done.indexOf(false);
  const doneText = [cv && c.cvDone(cv.name, cv.version), job && c.jobDone(job.title, job.more), null];
  const action = (index: number) => {
    const primary = next === index;
    if (index === 0) return <span className="flex flex-wrap gap-2"><Button asChild variant={primary ? 'default' : 'outline'}><Link to={`${base}/profile`}><Upload size={17} aria-hidden="true" />{t('workspace.addCv')}</Link></Button><BuildCvButton projectId={base.split('/').pop() ?? ''} /></span>;
    if (index === 1) return <Button asChild variant={primary ? 'default' : 'outline'}><Link to={`${base}/search`}><Search size={17} aria-hidden="true" />{t('workspace.findJobs')}</Link></Button>;
    return null;
  };
  return <section aria-labelledby="getting-started-heading" className="workspace-panel p-5 sm:p-6">
    <h2 id="getting-started-heading" className="text-xl font-semibold">{c.gettingStarted}</h2>
    <ol className="mt-5 grid gap-1">
      {c.steps.map((step, index) => {
        const finished = done[index];
        const blocked = index === 2 && !finished;
        return <li key={step.title} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
          <span data-stage={STEP_STAGE[index]} data-active={finished || next === index} className={cn('stage-tile !size-9 !rounded-full text-sm font-semibold', !finished && next !== index && 'opacity-70')}>
            {finished ? <><CheckCircle2 size={20} aria-hidden="true" /><span className="sr-only">{c.stepDone}</span></> : index + 1}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">{step.title}{next === index && <Badge variant="secondary">{c.nextStep}</Badge>}</p>
            <p className="mt-1 break-words text-sm text-muted-foreground">{finished && doneText[index] ? doneText[index] : blocked ? c.waitsFor(!done[0], !done[1]) : step.body}</p>
          </div>
          {!finished && action(index) && <div className="col-start-2 sm:col-start-3">{action(index)}</div>}
        </li>;
      })}
    </ol>
    <p className="mt-3 flex items-start gap-3 border-t pt-4 text-sm text-muted-foreground"><Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{t('workspace.manual')}</p>
  </section>;
}

const helpKey = 'ui.overview.help';

// Full tips until the first CV exists; after that a single card the user can dismiss (local preference only).
export function HelpPanel({ hasCv }: { hasCv: boolean }) {
  const c = useOverviewCopy();
  const [state, setState] = useState(() => readPreference(helpKey, ['shown', 'dismissed'], 'shown'));
  if (hasCv && state === 'dismissed') return null;
  const tips = hasCv ? c.tips.slice(1, 2) : c.tips;
  return <section aria-labelledby="help-heading" className="workspace-panel self-start p-5 sm:p-6">
    <h2 id="help-heading" className="flex items-center gap-3 text-xl font-semibold"><Compass size={24} className="text-primary" aria-hidden="true" />{c.helpTitle}</h2>
    <ul className="mt-4 grid gap-4">{tips.map(tip => <li key={tip.title} className="border-t pt-4 first:border-t-0 first:pt-0"><p className="font-semibold">{tip.title}</p><p className="mt-1 text-sm text-muted-foreground">{tip.body}</p></li>)}</ul>
    {hasCv && <Button variant="ghost" size="sm" className="mt-3 -ms-3" onClick={() => { savePreference(helpKey, 'dismissed'); setState('dismissed'); }}>{c.dismissHelp}</Button>}
  </section>;
}
