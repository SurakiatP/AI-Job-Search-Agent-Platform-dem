import type { CSSProperties } from 'react';
import { FileText, Kanban, MessagesSquare, Search, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

const STEPS = [
  ['profile', 'cv', UserRound, 'nav.cv'], ['search', 'search', Search, 'nav.search'], ['sessions', 'evaluate', MessagesSquare, 'nav.evaluate'],
  ['documents', 'docs', FileText, 'nav.documents'], ['applications', 'track', Kanban, 'nav.savedJobs'],
] as const;

// The job-search journey in one glance: each step keeps the hue it has in the sidebar and on its pages.
export function JourneyStrip({ base }: { base: string }) {
  const { t } = useTranslation();
  return <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label={t('workspace.journey')}>
    {STEPS.map(([section, stage, Icon, label], index) => <li key={section} className="col-span-2 min-w-0 sm:col-span-1 [&:not(:last-child)]:col-span-1">
      <Link to={`${base}/${section}`} className="group flex h-full min-h-14 items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-[var(--shadow-xs)] transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-[color:var(--stage)]" data-stage={stage} style={{ '--stage': `var(--stage-${stage})` } as CSSProperties}>
        <span className="stage-tile !size-9 shrink-0" data-stage={stage} data-active="true"><Icon size={18} aria-hidden="true" /></span>
        <span className="min-w-0"><span className="block text-xs tabular-nums text-muted-foreground">{index + 1}</span><span className="block text-sm font-semibold leading-snug">{t(label)}</span></span>
      </Link>
    </li>)}
  </ol>;
}
