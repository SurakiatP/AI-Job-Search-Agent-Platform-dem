import { useRef, type ReactNode } from 'react';
import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import './admin-ui.css';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Badges, a Stepper or a line of text under the title. */
  subtitle?: ReactNode;
  /** Sticky footer with the actions; omit for none. */
  footer?: ReactNode;
  /** Accessible name of the close button (translated by the caller). */
  closeLabel: string;
  children: ReactNode;
  className?: string;
}

/** Right-side sheet (bottom sheet under 640px). Esc, a click on the scrim and the close button close it; focus returns to the element that opened it. */
export function Sheet({ open, onOpenChange, title, subtitle, footer, closeLabel, children, className }: SheetProps) {
  const opener = useRef<HTMLElement | null>(null);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <Primitive.Portal>
      <Primitive.Overlay className="drawer-overlay z-50" />
      <Primitive.Content aria-describedby={undefined}
        onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={e => { if (opener.current?.isConnected) { e.preventDefault(); opener.current.focus(); } }}
        className={cn('admin-sheet fixed z-50 grid grid-rows-[auto_minmax(0,1fr)_auto] border bg-card text-card-foreground shadow-[var(--shadow-lift)]',
          'bottom-2 right-2 top-2 w-[min(600px,calc(100vw-1rem))] rounded-2xl',
          'max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[92dvh] max-sm:w-full max-sm:rounded-b-none', className)}>
        <header className="flex items-start gap-3 border-b px-6 pb-4 pt-5 max-sm:px-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-xl leading-snug [overflow-wrap:anywhere]">{title}</DialogTitle>
            {subtitle ? <div className="mt-2 text-sm text-muted-foreground">{subtitle}</div> : null}
          </div>
          <DialogClose asChild><Button variant="ghost" size="icon-sm" aria-label={closeLabel}><X className="size-5" aria-hidden="true" /></Button></DialogClose>
        </header>
        <div className="grid min-h-0 content-start gap-5 overflow-auto px-6 py-5 max-sm:px-4">{children}</div>
        {footer ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4 max-sm:px-4">{footer}</footer> : null}
      </Primitive.Content>
    </Primitive.Portal>
  </Dialog>;
}
