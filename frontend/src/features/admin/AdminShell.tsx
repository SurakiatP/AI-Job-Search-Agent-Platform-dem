import { useState, type ReactNode } from 'react';
import * as Drawer from '@radix-ui/react-dialog';
import { Activity, LayoutDashboard, LogOut, Menu, Monitor, Moon, Receipt, ScrollText, Server, SlidersHorizontal, Sun, UserCog, Users, X, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useTheme, type Theme } from '../../app/theme';
import { BrandIcon, LanguageToggle } from '../../components/Header';
import { Button } from '../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { logout, useAccount } from '../../lib/api';

const groups: { label?: string; items: [path: string, key: string, icon: LucideIcon][] }[] = [
  { items: [['/admin', 'overview', LayoutDashboard]] },
  { label: 'people', items: [['/admin/users', 'users', Users], ['/admin/runs', 'runs', Activity]] },
  { label: 'ai', items: [['/admin/usage', 'usage', Receipt], ['/admin/models', 'models', SlidersHorizontal]] },
  { label: 'system', items: [['/admin/system', 'system', Server], ['/admin/audit', 'audit', ScrollText]] },
];
const themes = [['light', Sun], ['dark', Moon], ['system', Monitor]] as const;

function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('admin-shell');
  return <Link to="/admin" className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-10">
    <BrandIcon /><span className={`whitespace-nowrap font-heading text-lg font-medium ${compact ? 'hidden sm:inline' : ''}`}>{t('brand')}</span>
    <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-medium leading-none text-accent-foreground">{t('badge')}</span>
  </Link>;
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation('admin-shell');
  const { pathname } = useLocation();
  return <nav aria-label={t('nav.label')} className="grid gap-0.5">
    {groups.map((group, index) => <div key={index} className="grid gap-0.5">
      {group.label && <p className="px-3 pb-1 pt-4 text-xs font-medium text-muted-foreground">{t(`group.${group.label}`)}</p>}
      {group.items.map(([path, key, Icon]) => {
        const active = path === '/admin' ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
        return <Link key={path} to={path} onClick={onNavigate} aria-current={active ? 'page' : undefined}
          className="flex min-h-11 min-w-0 items-center gap-3 rounded-full px-3 text-sm font-medium transition-colors hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-[color:var(--nav-active)] aria-[current=page]:text-primary lg:min-h-10">
          <Icon size={20} strokeWidth={1.75} className="shrink-0" aria-hidden="true" /><span className="min-w-0 [overflow-wrap:anywhere]">{t(`nav.${key}`)}</span>
        </Link>;
      })}
    </div>)}
  </nav>;
}

// Admins have no workspace, so the menu holds my account, appearance and sign out (the app's AccountMenu links to pages they cannot open).
function AdminAccount({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const shell = useTranslation('admin-shell').t;
  const email = useAccount()?.email ?? '';
  const { theme, setTheme } = useTheme();
  const next = themes[(themes.findIndex(([value]) => value === theme) + 1) % themes.length][0] as Theme;
  const ThemeIcon = themes.find(([value]) => value === theme)![1];
  return <DropdownMenu>
    <DropdownMenuTrigger aria-label={`${t('account.menu')}: ${email}`} className={`flex min-h-11 min-w-0 items-center gap-3 rounded-lg text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-10 ${compact ? 'rounded-full' : 'w-full px-2 hover:bg-primary/[0.04]'}`}>
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-foreground">{email.slice(0, 2).toUpperCase()}</span>
      {!compact && <span className="min-w-0"><span className="block truncate font-medium" title={email}>{email}</span><span className="block text-xs text-muted-foreground">{shell('role')}</span></span>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align={compact ? 'end' : 'start'} side={compact ? 'bottom' : 'top'} className="min-w-56">
      <DropdownMenuItem onSelect={event => { event.preventDefault(); setTheme(next); }}><ThemeIcon aria-hidden="true" />{t('appearance')}<span className="ms-auto text-xs text-muted-foreground">{t(theme)}</span></DropdownMenuItem>
      <DropdownMenuItem asChild><Link to="/admin/account"><UserCog aria-hidden="true" />{shell('account')}</Link></DropdownMenuItem>
      <div role="separator" className="my-1 h-px bg-border" />
      <DropdownMenuItem onSelect={() => void logout()}><LogOut aria-hidden="true" />{t('auth.logout')}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const shell = useTranslation('admin-shell').t;
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  return <>
    <a href="#main-content" className="skip-link">{t('skipToContent')}</a>
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:bg-sidebar">
      <aside className="sticky top-0 hidden h-dvh min-w-0 flex-col gap-2 overflow-y-auto p-3 lg:flex">
        <div className="px-1 pt-1"><Brand /></div>
        <Nav />
        <div className="mt-auto flex min-w-0 items-center gap-1 border-t pt-3"><div className="min-w-0 flex-1"><AdminAccount /></div><LanguageToggle /></div>
      </aside>
      <div className="min-w-0 lg:p-2 lg:ps-0">
        <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between gap-2 border-b bg-sidebar px-3 py-2 lg:hidden">
          <div className="flex min-w-0 items-center gap-1">
            <Button variant="ghost" className="min-h-11 gap-2 px-3" onClick={() => setOpen(true)} aria-label={shell('menuTitle')}><Menu size={20} aria-hidden="true" />{shell('menu')}</Button>
            <Brand compact />
          </div>
          <div className="flex shrink-0 items-center gap-1"><LanguageToggle /><AdminAccount compact /></div>
        </header>
        <Drawer.Root open={open} onOpenChange={setOpen}>
          <Drawer.Portal>
            <Drawer.Overlay className="drawer-overlay" />
            <Drawer.Content aria-describedby={undefined} className="mobile-drawer flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between gap-2"><Drawer.Title className="px-2 font-heading text-lg font-medium">{shell('menuTitle')}</Drawer.Title><Drawer.Close asChild><Button variant="ghost" size="icon" className="size-11" aria-label={shell('close')}><X size={20} aria-hidden="true" /></Button></Drawer.Close></div>
              <Nav onNavigate={() => setOpen(false)} />
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
        <div className="min-w-0 bg-background ambient-surface lg:min-h-[calc(100dvh-16px)] lg:overflow-clip lg:rounded-2xl lg:border">
          <main id="main-content" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1360px] px-4 py-6 sm:px-6 sm:py-8 xl:px-10 xl:py-10">
            <div key={pathname} className="page-enter grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:gap-8">{children}</div>
          </main>
        </div>
      </div>
    </div>
  </>;
}
