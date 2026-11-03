import type { ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { ripple } from '@/lib/ripple';
import { Spinner } from './spinner';

export const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:border-primary/40 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'disabled:bg-foreground/12 disabled:text-foreground/38 bg-primary-fill text-primary-fill-foreground hover:bg-primary-fill/90 active:bg-primary-fill/80',
        secondary: 'disabled:bg-foreground/12 disabled:text-foreground/38 bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70',
        outline: 'disabled:border-foreground/12 disabled:bg-transparent disabled:text-foreground/38 border border-[color:var(--border-strong)] bg-card hover:bg-primary/[0.04] active:bg-primary/12',
        ghost: 'disabled:text-foreground/38 hover:bg-primary/[0.04] active:bg-primary/12',
        destructive: 'disabled:bg-foreground/12 disabled:text-foreground/38 bg-destructive-fill text-primary-fill-foreground hover:bg-destructive-fill/90 active:bg-destructive-fill/80',
        link: 'disabled:text-foreground/38 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-11 px-4 py-2 lg:min-h-10 pointer-coarse:min-h-12',
        sm: 'min-h-11 px-3 text-sm lg:min-h-9 pointer-coarse:min-h-11',
        lg: 'min-h-12 px-6 text-base [&_svg]:size-5',
        icon: 'size-11 rounded-lg lg:size-10 pointer-coarse:size-12',
        'icon-sm': 'size-11 rounded-lg lg:size-9 pointer-coarse:size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

// `busy` shows the turning ring before the label, marks the button aria-busy and keeps it from being pressed twice.
export function Button({ className, variant, size, asChild = false, busy = false, children, disabled, ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean; busy?: boolean }) {
  if (asChild) return <Slot className={cn(buttonVariants({ variant, size }), className)} {...props}>{children}</Slot>;
  return <button className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || busy} aria-busy={busy || undefined} onPointerDown={event => { ripple(event); props.onPointerDown?.(event); }} {...props}>{busy && <Spinner />}{children}</button>;
}
