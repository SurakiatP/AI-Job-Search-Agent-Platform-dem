import type { ComponentProps } from 'react';
import * as Primitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

export const Dialog = Primitive.Root;
export const DialogClose = Primitive.Close;

export function DialogContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal>
    <Primitive.Overlay className="drawer-overlay z-50" />
    <Primitive.Content className={cn('fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-lg', className)} {...props} />
  </Primitive.Portal>;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof Primitive.Title>) {
  return <Primitive.Title className={cn('text-lg font-semibold leading-snug', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof Primitive.Description>) {
  return <Primitive.Description className={cn('text-sm text-muted-foreground [overflow-wrap:anywhere]', className)} {...props} />;
}
