import type { ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:border-primary/40 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70',
        outline: 'border border-[color:var(--border-strong)] bg-card hover:bg-muted/60 active:bg-muted',
        ghost: 'hover:bg-[color:var(--nav-hover)] active:bg-muted',
        destructive: 'bg-destructive text-primary-foreground hover:bg-destructive/90 active:bg-destructive/80',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-11 px-4 py-2 lg:min-h-10',
        sm: 'min-h-11 px-3 text-sm lg:min-h-10',
        lg: 'min-h-11 px-5 text-base',
        icon: 'size-11 rounded-lg lg:size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

// `busy` shows the turning ring before the label, marks the button aria-busy and keeps it from being pressed twice.
export function Button({ className, variant, size, asChild = false, busy = false, children, disabled, ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean; busy?: boolean }) {
  if (asChild) return <Slot className={cn(buttonVariants({ variant, size }), className)} {...props}>{children}</Slot>;
  return <button className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || busy} aria-busy={busy || undefined} {...props}>{busy && <Spinner />}{children}</button>;
}
