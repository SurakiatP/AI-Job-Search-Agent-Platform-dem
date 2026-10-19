import { BookOpen, ChevronDown, Menu } from 'lucide-react';
import { Link } from 'react-router';
import { useLocale } from '../../app/providers';
import { Button } from '../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { landingCopy } from './copy';

// Scroll to a landing section; the tour tab (if any) is chosen first. No smooth scrolling, so reduced-motion needs no special case.
function goTo(id: string, tab?: number) {
  if (tab !== undefined) window.dispatchEvent(new CustomEvent('landing:tour', { detail: tab }));
  document.getElementById(id)?.scrollIntoView({ block: 'start' });
}

const link = 'inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
        {c.steps.map((step, index) => <DropdownMenuItem key={step.tab} onSelect={() => goTo('how', index)} className="grid gap-0.5">
          <span className="font-medium">{step.tab}</span>
          <span className="text-xs text-muted-foreground">{step.eyebrow}</span>
        </DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    <a href="#steps" onClick={event => { event.preventDefault(); goTo('steps'); }} className={link}>{c.nav.how}</a>
    <a href="#data" onClick={event => { event.preventDefault(); goTo('data'); }} className={link}>{c.nav.data}</a>
    <Link to="/docs" className={`${link} gap-1.5`}><BookOpen className="size-4" aria-hidden="true" />{c.docs}</Link>
  </nav>;
}

/** The same links in one menu for narrower screens. */
export function LandingMenu({ signedOut }: { signedOut: boolean }) {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  return <div className="xl:hidden">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={c.nav.menu}><Menu className="size-5" aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onSelect={() => goTo('steps')}>{c.nav.how}</DropdownMenuItem>
        {c.steps.map((step, index) => <DropdownMenuItem key={step.tab} onSelect={() => goTo('how', index)}>{step.tab}</DropdownMenuItem>)}
        <DropdownMenuItem onSelect={() => goTo('data')}>{c.nav.data}</DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/docs">{c.docs}</Link></DropdownMenuItem>
        {signedOut && <DropdownMenuItem asChild className="sm:hidden"><Link to="/login">{c.login}</Link></DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
