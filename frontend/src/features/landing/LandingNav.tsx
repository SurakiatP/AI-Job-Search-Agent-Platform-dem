import { BookOpen, ChevronDown, Menu } from 'lucide-react';
import { Link } from 'react-router';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Header } from '../../components/Header';
import { Button } from '../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { landingCopy } from './copy';
import { featureSlugs } from './featurePages';

const link = 'inline-flex min-h-11 lg:min-h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Centre menu of the public header (wide screens). Only sections and pages that exist. */
export function LandingNav() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  return <nav aria-label={c.nav.label} className="hidden flex-1 items-center justify-center gap-1 xl:flex">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`${link} gap-1 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground`}>{c.nav.features}<ChevronDown className="size-4" aria-hidden="true" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-2">
        {c.steps.map((step, index) => <DropdownMenuItem key={step.tab} asChild className="grid gap-0.5">
          <Link to={`/features/${featureSlugs[index]}`}>
            <span className="font-medium">{step.tab}</span>
            <span className="text-xs text-muted-foreground">{step.eyebrow}</span>
          </Link>
        </DropdownMenuItem>)}
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
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{c.nav.features}</DropdownMenuLabel>
        {c.steps.map((step, index) => <DropdownMenuItem key={step.tab} asChild><Link to={`/features/${featureSlugs[index]}`}>{step.tab}</Link></DropdownMenuItem>)}
        <div role="separator" className="my-1 h-px bg-border" />
        <DropdownMenuItem asChild><Link to="/how-it-works">{c.nav.how}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/data">{c.nav.data}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/docs">{c.docs}</Link></DropdownMenuItem>
        {signedOut && <DropdownMenuItem asChild className="sm:hidden"><Link to="/login">{c.login}</Link></DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}

/** One header for every public page: menu, Log in and Get started (or Open app once signed in). Nothing shows until the session is known. */
export function PublicHeader() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  const status = useOwnerSession().status;
  const signedOut = status !== 'ready' && status !== 'loading';
  return <Header menu={<LandingMenu signedOut={signedOut} />} nav={<LandingNav />} actions={<>
    {signedOut && <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex"><Link to="/login">{c.login}</Link></Button>}
    {status === 'ready' ? <Button asChild size="sm"><Link to="/app/projects">{c.openApp}</Link></Button> : signedOut && <Button asChild size="sm"><Link to="/signup">{c.signup}</Link></Button>}
  </>} />;
}
