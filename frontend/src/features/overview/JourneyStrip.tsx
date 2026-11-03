import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

const STEPS = [['profile', 'nav.cv'], ['sessions', 'nav.evaluate'], ['documents', 'nav.documents'], ['applications', 'nav.savedJobs']] as const;

export type JourneyCounts = Partial<Record<(typeof STEPS)[number][0], number>>;

// Where you are, as one quiet line: a real count per area, each a link; counts only when loaded.
export function JourneyStrip({ base, counts = {} }: { base: string; counts?: JourneyCounts }) {
  const { t } = useTranslation();
  return <nav aria-label={t('workspace.journey')} className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
    {STEPS.map(([section, label]) => counts[section] != null && <Link key={section} to={`${base}/${section}`} className="grid min-h-11 content-start gap-1 hover:underline lg:min-h-10"><span className="text-xl font-semibold tabular-nums text-foreground">{counts[section]}</span><span className="text-sm text-muted-foreground">{t(label)}</span></Link>)}
  </nav>;
}
