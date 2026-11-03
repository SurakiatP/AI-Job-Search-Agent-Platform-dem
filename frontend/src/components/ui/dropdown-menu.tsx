import type { ComponentProps } from 'react';
import * as Primitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;

export function DropdownMenuContent({ className, sideOffset = 4, ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Content sideOffset={sideOffset} className={cn('menu-surface z-50 min-w-40 max-w-[90vw] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md', className)} {...props} /></Primitive.Portal>;
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn('flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 text-sm pointer-coarse:min-h-11 outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0', className)} {...props} />;
}

export const DropdownMenuRadioGroup = Primitive.RadioGroup;

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof Primitive.RadioItem>) {
  return <Primitive.RadioItem className={cn('flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 text-sm pointer-coarse:min-h-11 outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:font-medium', className)} {...props}>
    {children}<Primitive.ItemIndicator className="ms-auto text-primary"><Check className="size-4" aria-hidden="true" /></Primitive.ItemIndicator>
  </Primitive.RadioItem>;
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return <Primitive.Label className={cn('px-3 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props} />;
}
