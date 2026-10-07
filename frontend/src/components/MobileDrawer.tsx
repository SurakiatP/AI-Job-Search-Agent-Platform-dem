import { useState } from 'react';
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';

export function MobileDrawer({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><Button variant="ghost" size="icon" aria-label={t('openMenu')}><Menu aria-hidden="true" size={22} /></Button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="drawer-overlay" />
      <Dialog.Content className="mobile-drawer flex flex-col" aria-describedby={undefined}>
        <div className="drawer-heading">
          <Dialog.Title>{t('mainMenu')}</Dialog.Title>
          <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label={t('closeMenu')}><X aria-hidden="true" size={22} /></Button></Dialog.Close>
        </div>
        {children(() => setOpen(false))}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
