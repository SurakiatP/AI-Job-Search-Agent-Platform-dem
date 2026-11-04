import { useState, type ReactNode } from 'react';
import { Activity, LayoutDashboard, LogOut, Monitor, Moon, Receipt, ScrollText, Server, SlidersHorizontal, Sun, UserCog, Users, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useTheme, type Theme } from '../../../app/theme';
import { BrandIcon, LanguageToggle } from '../../../components/Header';
import { SidebarToggle } from '../../../components/SidebarToggle';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { logout, useAccount } from '../../../lib/api';

// Same item shape as the workspace sidebar (components/ProjectSidebar.tsx); the labels truncate so a width change never re-wraps them.
const itemClass = 'flex min-h-11 lg:min-h-10 min-w-0 items-center gap-2 rounded-lg px-3 text-sm text-foreground transition-colors hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-[color:var(--nav-active)] data-[active=true]:font-medium data-[active=true]:text-primary';
const tipClass = 'tip pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background shadow';

// stage = the workspace's journey hue, one per group, so the active icon is tinted like the workspace's.
const groups: { label?: string; stage: string; items: [path: string, key: string, icon: LucideIcon][] }[] = [
  { stage: 'search', items: [['/admin', 'overview', LayoutDashboard]] },
  { label: 'people', stage: 'cv', items: [['/admin/users', 'users', Users], ['/admin/runs', 'runs', Activity]] },
  { label: 'ai', stage: 'evaluate', items: [['/admin/usage', 'usage', Receipt], ['/admin/models', 'models', SlidersHorizontal]] },
  { label: 'system', stage: 'docs', items: [['/admin/system', 'system', Server], ['/admin/audit', 'audit', ScrollText]] },
];
const themes = [['light', Sun], ['dark', Moon], ['system', Monitor]] as const;

/** Wraps something in the workspace rail's hover and focus tooltip; the tooltip only exists while the sidebar is a rail. */
function RailTip({ rail, label, children }: { rail: boolean; label: string; children: ReactNode }) {
  const [off, setOff] = useState(false);
  return <span className="group relative block min-w-0" data-tip-off={off || undefined} onClick={() => setOff(true)} onKeyDown={event => { if (event.key === 'Escape') setOff(true); }} onPointerLeave={() => setOff(false)} onBlur={() => setOff(false)}>
    {children}{rail && <span role="tooltip" className={tipClass}>{label}</span>}
  </span>;
}

export function Brand({ compact = false, rail = false }: { compact?: boolean; rail?: boolean }) {
  const { t } = useTranslation('admin-shell');
  const hide = rail ? 'sr-only' : '';
  return <RailTip rail={rail} label={`${t('brand')} ${t('badge')}`}>
    <Link to="/" aria-label={`${t('brand')} ${t('badge')}: ${t('home')}`} className={`flex min-h-11 min-w-0 items-center gap-2 rounded-lg text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-10 ${rail ? 'justify-center' : ''}`}>
      <BrandIcon />
      <span className={`flex ${compact ? 'min-w-0 items-center gap-2' : 'shrink-0 flex-col items-start gap-0.5'} ${hide}`}>
        <span className={`whitespace-nowrap font-heading text-lg font-medium leading-none ${compact ? 'hidden sm:inline' : ''}`}>{t('brand')}</span>
        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium leading-none text-accent-foreground">{t('badge')}</span>
      </span>
    </Link>
  </RailTip>;
}

export function Nav({ onNavigate, rail = false }: { onNavigate?: () => void; rail?: boolean }) {
  const { t } = useTranslation('admin-shell');
  const { pathname } = useLocation();
  return <nav aria-label={t('nav.label')} className="grid gap-0.5">
    {groups.map((group, index) => <div key={index} className="grid gap-0.5">
      {group.label && (rail ? <div aria-hidden="true" className="mx-3 mb-1 mt-3 border-t" /> : <p className="truncate px-3 pb-1 pt-4 text-xs font-medium text-muted-foreground">{t(`group.${group.label}`)}</p>)}
      {group.items.map(([path, key, Icon]) => {
        const active = path === '/admin' ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
        return <RailTip key={path} rail={rail} label={t(`nav.${key}`)}>
          <Link to={path} onClick={onNavigate} className={`${itemClass} ${rail ? 'px-[10px]' : ''}`} data-active={active} aria-current={active ? 'page' : undefined}>
            <span className="stage-tile" data-stage={group.stage} data-active={active}><Icon size={18} strokeWidth={1.75} className="shrink-0" aria-hidden="true" /></span>
            <span className={rail ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{t(`nav.${key}`)}</span>
          </Link>
        </RailTip>;
      })}
    </div>)}
  </nav>;
}

// Admins have no workspace, so the menu holds my account, appearance and sign out (the app's AccountMenu links to pages they cannot open).
export function AdminAccount({ compact = false, rail = false }: { compact?: boolean; rail?: boolean }) {
  const { t } = useTranslation();
  const shell = useTranslation('admin-shell').t;
  const email = useAccount()?.email ?? '';
  const { theme, setTheme } = useTheme();
  const next = themes[(themes.findIndex(([value]) => value === theme) + 1) % themes.length][0] as Theme;
  const ThemeIcon = themes.find(([value]) => value === theme)![1];
  const bare = compact || rail;
  return <DropdownMenu>
    <RailTip rail={rail} label={email}>
      <DropdownMenuTrigger aria-label={`${t('account.menu')}: ${email}`} className={`flex min-h-11 min-w-0 items-center gap-2 rounded-lg text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-10 ${compact ? 'rounded-full' : 'w-full px-2 hover:bg-primary/[0.04]'} ${rail ? 'justify-center' : ''}`}>
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-foreground">{email.slice(0, 2).toUpperCase()}</span>
        {!bare && <span className="min-w-0"><span className="block truncate font-medium" title={email}>{email}</span><span className="block text-xs text-muted-foreground">{shell('role')}</span></span>}
      </DropdownMenuTrigger>
    </RailTip>
    <DropdownMenuContent align={compact ? 'end' : 'start'} side={compact ? 'bottom' : rail ? 'right' : 'top'} className="min-w-56">
      <DropdownMenuItem onSelect={event => { event.preventDefault(); setTheme(next); }}><ThemeIcon aria-hidden="true" />{t('appearance')}<span className="ms-auto text-xs text-muted-foreground">{t(theme)}</span></DropdownMenuItem>
      <DropdownMenuItem asChild><Link to="/admin/account"><UserCog aria-hidden="true" />{shell('account')}</Link></DropdownMenuItem>
      <div role="separator" className="my-1 h-px bg-border" />
      <DropdownMenuItem onSelect={() => void logout()}><LogOut aria-hidden="true" />{t('auth.logout')}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

/** Desktop sidebar: the full bar, or an icon rail that keeps the same elements in the same places so nothing remounts or jumps. */
export function AdminSidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const rail = !open;
  return <aside className={`sticky top-0 z-20 hidden h-dvh min-w-0 flex-col gap-2 p-3 lg:flex ${rail ? 'overflow-visible' : 'overflow-y-auto overflow-x-hidden'}`}>
    <div className={`flex min-w-0 gap-2 pt-1 ${rail ? 'flex-col items-stretch' : 'items-center justify-between'}`}>
      <div className="min-w-0"><Brand rail={rail} /></div>
      <span className={rail ? 'flex justify-center' : 'shrink-0'}><SidebarToggle open={open} onToggle={onToggle} /></span>
    </div>
    <Nav rail={rail} />
    <div className={`mt-auto flex min-w-0 gap-1 border-t pt-3 ${rail ? 'flex-col items-stretch' : 'items-center'}`}>
      <div className="min-w-0 flex-1"><AdminAccount rail={rail} /></div>
      <div className={rail ? 'flex justify-center' : ''}><LanguageToggle /></div>
    </div>
  </aside>;
}
