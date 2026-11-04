import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** MUI Snackbar: a short message with at most one action, bottom-left, auto-hides after 6 s (paused while hovered or focused).
 *  It keeps the page's `role="status"` so the message is announced politely and never takes focus. */
export function Snackbar({ open, message, action, onClose, autoHideDuration = 6000, className }: {
  open: boolean; message: ReactNode; action?: ReactNode; onClose: () => void; autoHideDuration?: number; className?: string;
}) {
  const timer = useRef<number | undefined>(undefined);
  const hold = useRef(false);
  const start = () => { window.clearTimeout(timer.current); if (open && !hold.current) timer.current = window.setTimeout(onClose, autoHideDuration); };
  // Closing (e.g. by its own Undo button) skips pointer-leave/blur, so release the hover/focus hold here.
  useEffect(() => { if (!open) hold.current = false; start(); return () => window.clearTimeout(timer.current); }, [open, message]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return <div role="status" className={cn('snackbar fixed inset-x-4 bottom-4 z-50 flex min-h-12 items-center gap-4 rounded bg-foreground px-4 py-1.5 text-sm text-background shadow-[var(--shadow-8)] sm:inset-x-auto sm:start-6 sm:bottom-6 sm:min-w-72 sm:max-w-lg', className)}
    onPointerEnter={() => { hold.current = true; window.clearTimeout(timer.current); }} onPointerLeave={() => { hold.current = false; start(); }}
    onFocus={() => { hold.current = true; window.clearTimeout(timer.current); }} onBlur={() => { hold.current = false; start(); }}>
    <div className="min-w-0 flex-1 py-2 [overflow-wrap:anywhere]">{message}</div>
    {action && <div className="shrink-0 [&_button]:text-background [&_button]:underline [&_button]:hover:bg-background/10">{action}</div>}
  </div>;
}
