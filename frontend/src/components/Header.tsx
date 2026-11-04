import { useState, type ReactNode } from 'react';
import { House } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useLocale } from '../app/providers';
import { AppearanceControl } from './AppearanceControl';
import { Avatar } from './Avatar';
import { useOwnerSession } from '../lib/api';
import { Button } from './ui/button';

// App icon: the light or dark file follows the theme; decorative, the name is written beside it or on the link.
export function BrandIcon({ className = 'size-8' }: { className?: string }) {
  return <>
    <img src="/brand/job-search-icon-light.svg" alt="" aria-hidden="true" width={32} height={32} className={`${className} shrink-0 rounded-lg dark:hidden`} />
    <img src="/brand/job-search-icon-dark.svg" alt="" aria-hidden="true" width={32} height={32} className={`${className} hidden shrink-0 rounded-lg dark:block`} />
  </>;
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return <span className="flex min-w-0 items-center gap-2 text-sm font-semibold leading-snug">
    <BrandIcon />
    {!compact && <span className="hidden min-w-0 font-heading font-medium [overflow-wrap:anywhere] sm:inline">Job Search</span>}
  </span>;
}

export function HomeLink({ onClick, compact = false }: { onClick?: () => void; compact?: boolean }) {
  const { i18n } = useTranslation();
  return <Link to="/" onClick={onClick} aria-label={i18n.language.startsWith('th') ? 'หน้าแรก' : 'Home'} className="inline-flex min-h-11 shrink-0 items-center rounded-md lg:min-h-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Wordmark compact={compact} /></Link>;
}

// Collapsed-sidebar rail: a plain home icon (like ChatGPT) that clearly reads as "back to the landing page".
export function HomeIconLink() {
  const { i18n } = useTranslation();
  const label = i18n.language.startsWith('th') ? 'หน้าแรก' : 'Home';
  const [off, setOff] = useState(false);
  return <span className="group relative inline-flex" data-tip-off={off || undefined} onKeyDown={e => { if (e.key === 'Escape') setOff(true); }} onPointerLeave={() => setOff(false)} onBlur={() => setOff(false)}>
    <Link to="/" aria-label={label} className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <House size={18} aria-hidden="true" />
    </Link>
    <span role="tooltip" className="tip pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background shadow">{label}</span>
  </span>;
}

export function LanguageSwitch() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  return <div className="segmented" role="group" aria-label={t('language')}>
    {([['th', 'ไทย'], ['en', 'EN']] as const).map(([value, label]) => (
      <Button key={value} variant="ghost" size="sm" className="min-w-10" aria-pressed={locale === value} onClick={() => setLocale(value)}>{label}</Button>
    ))}
  </div>;
}

/** One button that always shows the language you would switch to; kept visible because owners switch often. */
export function LanguageToggle() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const next = locale === 'th' ? 'en' : 'th';
  return <Button variant="ghost" size="sm" className="min-w-11 shrink-0 font-medium" lang={next}
    aria-label={`${t('language')}: ${next === 'en' ? 'English' : 'ไทย'}`} onClick={() => setLocale(next)}>{next === 'en' ? 'EN' : 'ไทย'}</Button>;
}

export function Header({ menu, nav, actions }: { menu?: ReactNode; nav?: ReactNode; actions?: ReactNode }) {
  const { t } = useTranslation();
  const session = useOwnerSession();
  return <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between gap-3 border-b bg-background/90 px-4 py-2 backdrop-blur sm:px-6">
    <div className="flex min-w-0 items-center gap-2">{menu}<HomeLink /></div>
    {nav}
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      {actions}
      {session.status === 'ready' && <Link to="/app/account" aria-label={`${t('account.menu')}: ${session.user.email}`} title={session.user.email} className="flex shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"><Avatar account={session.user} size={40} /></Link>}
      <AppearanceControl compact />
      <LanguageSwitch />
    </div>
  </header>;
}
