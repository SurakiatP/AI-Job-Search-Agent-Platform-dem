import type { ComponentProps } from 'react';
import * as Primitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;

export function DropdownMenuContent({ className, sideOffset = 4, ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Content sideOffset={sideOffset} className={cn('z-50 min-w-40 max-w-[90vw] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md', className)} {...props} /></Primitive.Portal>;
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn('flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:shrink-0', className)} {...props} />;
}
