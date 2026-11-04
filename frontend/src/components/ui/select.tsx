import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Native select styled like Input; the browser keeps the picker and keyboard behaviour.
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn('flex min-h-11 w-full lg:min-h-10 pointer-coarse:min-h-12 rounded-xl border border-input bg-card ps-3 pe-8 py-2 text-base transition-colors hover:border-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 disabled:pointer-events-none disabled:opacity-50', className)} {...props} />;
}
