import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn('flex min-h-24 w-full rounded-lg border border-input bg-card px-3 py-2 text-base transition-colors placeholder:text-muted-foreground hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 disabled:pointer-events-none disabled:opacity-50', className)} {...props} />;
}
