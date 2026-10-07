import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn('flex min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50', className)} {...props} />;
}
