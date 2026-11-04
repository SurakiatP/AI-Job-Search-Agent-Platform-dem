import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn('flex min-h-11 w-full lg:min-h-10 pointer-coarse:min-h-12 rounded-xl border border-input bg-card px-3 py-2 text-base transition-colors placeholder:text-muted-foreground hover:border-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 disabled:pointer-events-none disabled:opacity-50', className)} {...props} />;
}
