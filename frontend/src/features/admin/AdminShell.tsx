import { useEffect, useState, type ReactNode } from 'react';
import * as Drawer from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { readPreference, savePreference } from '../../app/theme';
import { LanguageToggle } from '../../components/Header';
import { isSidebarShortcut } from '../../components/SidebarToggle';
import { Button } from '../../components/ui/button';
import { AdminAccount, AdminSidebar, Brand, Nav } from './shell/AdminSidebar';

export function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const shell = useTranslation('admin-shell').t;
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(() => readPreference('ui.admin-sidebar', ['open', 'closed'], 'open') === 'open');
  const toggle = () => setWide(value => { savePreference('ui.admin-sidebar', value ? 'closed' : 'open'); return !value; });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (isSidebarShortcut(event)) { event.preventDefault(); toggle(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <>
    <a href="#main-content" className="skip-link">{t('skipToContent')}</a>
    <div className={`min-h-dvh lg:grid lg:bg-sidebar lg:[transition:grid-template-columns_var(--dur-base)_var(--ease-out)] motion-reduce:transition-none ${wide ? 'lg:grid-cols-[248px_minmax(0,1fr)]' : 'lg:grid-cols-[64px_minmax(0,1fr)]'}`}>
      <AdminSidebar open={wide} onToggle={toggle} />
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
