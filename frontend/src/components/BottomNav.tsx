import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { navEntries } from './ProjectSidebar';

// Below 1024px the five destinations sit in a bottom tab bar; the hamburger drawer is gone.
export function BottomNav({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const base = `/app/projects/${projectId}`;
  return <nav aria-label={t('navigation')} className="fixed inset-x-0 bottom-0 z-20 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden">
    <ul className="grid grid-cols-5">{navEntries.map(([section, Icon, key, stage]) => {
      const active = pathname === `${base}/${section}` || pathname.startsWith(`${base}/${section}/`) || (section === 'applications' && pathname.startsWith(`${base}/jobs/`));
      return <li key={section} className="min-w-0"><Link to={`${base}/${section}`} aria-current={active ? 'page' : undefined} data-active={active} className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight text-muted-foreground data-[active=true]:font-medium data-[active=true]:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className="stage-tile" data-stage={stage} data-active={active}><Icon size={20} strokeWidth={1.75} aria-hidden="true" /></span>
        <span className="max-w-full truncate">{t(key)}</span>
      </Link></li>;
    })}</ul>
  </nav>;
}
