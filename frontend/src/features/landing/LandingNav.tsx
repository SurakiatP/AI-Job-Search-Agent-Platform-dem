import { BellRing, BookOpen, ChevronDown, FileText, Menu, MessagesSquare, Mic, PenLine, Search, SquareKanban, Sparkles, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { HomeLink, LanguageSwitch } from '../../components/Header';
import { AppearanceControl } from '../../components/AppearanceControl';
import { Avatar } from '../../components/Avatar';
import { landingCopy } from './copy';
import { featureSlugs } from './featurePages';

/** One icon per feature, same order as `steps` and `featureSlugs`. */
export const featureIcons = [Upload, PenLine, Search, Sparkles, Mic, FileText, SquareKanban, BellRing, MessagesSquare] as const;
const tints = ['bg-[color-mix(in_oklab,var(--gem-blue)_16%,transparent)]', 'bg-[color-mix(in_oklab,var(--gem-violet)_16%,transparent)]', 'bg-[color-mix(in_oklab,var(--gem-rose)_16%,transparent)]', 'bg-[color-mix(in_oklab,var(--gem-amber)_20%,transparent)]', 'bg-[color-mix(in_oklab,var(--gem-green)_16%,transparent)]'];

const link = 'inline-flex min-h-11 lg:min-h-10 items-center rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Centre menu of the public header (wide screens). Only sections and pages that exist. */
export function LandingNav() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  return <nav aria-label={c.nav.label} className="hidden flex-1 items-center justify-center gap-1 xl:flex">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`${link} gap-1 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground`}>{c.nav.features}<ChevronDown className="size-4" aria-hidden="true" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={12} className="grid w-[40rem] grid-cols-1 gap-1 rounded-3xl p-3 shadow-[var(--shadow-lift)] md:grid-cols-2">
        {c.steps.map((step, index) => { const Icon = featureIcons[index]; return <DropdownMenuItem key={step.tab} asChild className="min-h-14 items-center gap-3 rounded-2xl p-2 data-[highlighted]:bg-accent/60">
          <Link to={`/features/${featureSlugs[index]}`}>
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tints[index % tints.length]}`}><Icon className="size-5 text-foreground" aria-hidden="true" /></span>
            <span className="grid min-w-0 gap-0.5">
              <span className="text-sm font-medium text-foreground">{step.tab}</span>
              <span className="text-xs text-muted-foreground">{step.eyebrow}</span>
            </span>
          </Link>
        </DropdownMenuItem>; })}
      </DropdownMenuContent>
    </DropdownMenu>
    <Link to="/how-it-works" className={link}>{c.nav.how}</Link>
    <Link to="/data" className={link}>{c.nav.data}</Link>
    <Link to="/docs" className={`${link} gap-2`}><BookOpen className="size-4" aria-hidden="true" />{c.docs}</Link>
  </nav>;
}

/** The same links, in the same order, in one labelled menu for narrower screens. */
export function LandingMenu({ signedOut }: { signedOut: boolean }) {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  return <div className="xl:hidden">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={c.nav.menu}><Menu className="size-5" aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={12} className="w-64 rounded-3xl p-2 shadow-[var(--shadow-lift)]">
        <DropdownMenuLabel>{c.nav.features}</DropdownMenuLabel>
        {c.steps.map((step, index) => <DropdownMenuItem key={step.tab} asChild className="rounded-xl"><Link to={`/features/${featureSlugs[index]}`}>{step.tab}</Link></DropdownMenuItem>)}
        <div role="separator" className="my-1 h-px bg-border" />
        <DropdownMenuItem asChild className="rounded-xl"><Link to="/how-it-works">{c.nav.how}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild className="rounded-xl"><Link to="/data">{c.nav.data}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild className="rounded-xl"><Link to="/docs">{c.docs}</Link></DropdownMenuItem>
        {signedOut && <DropdownMenuItem asChild className="rounded-xl sm:hidden"><Link to="/login">{c.login}</Link></DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}

/** Floating pill header for every public page: menu, Log in and Get started (or Open app once signed in). Nothing shows until the session is known. */
export function PublicHeader() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  const { t } = useTranslation();
  const session = useOwnerSession();
  const status = session.status;
  const signedOut = status !== 'ready' && status !== 'loading';
  return <header className="sticky top-3 z-40 px-3 lg:top-4 sm:px-6">
    <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-3 rounded-full border bg-card/80 py-1.5 pl-3 pr-2 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:pl-4">
      <div className="flex min-w-0 items-center gap-1"><LandingMenu signedOut={signedOut} /><HomeLink /></div>
      <LandingNav />
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {signedOut && <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex"><Link to="/login">{c.login}</Link></Button>}
        {status === 'ready' ? <Button asChild size="sm"><Link to="/app/projects">{c.openApp}</Link></Button> : signedOut && <Button asChild size="sm"><Link to="/signup">{c.signup}</Link></Button>}
        {session.status === 'ready' && <Link to="/app/account" aria-label={`${t('account.menu')}: ${session.user.email}`} title={session.user.email} className="flex shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"><Avatar account={session.user} size={40} /></Link>}
        <AppearanceControl compact />
        <LanguageSwitch />
      </div>
    </div>
  </header>;
}
