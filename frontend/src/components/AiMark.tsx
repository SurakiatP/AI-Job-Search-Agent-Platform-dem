import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// Marks anything the AI agent produces or is working on. Decorative: the words beside it say what it is.
export function AiMark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return <span aria-hidden="true" className={cn('inline-grid shrink-0 place-items-center rounded-full bg-accent text-primary', size === 'sm' ? 'size-5' : 'size-7', className)}>
    <Sparkles className={size === 'sm' ? 'size-3' : 'size-4'} />
  </span>;
}

// The mark with a ring that turns around it while the agent is processing.
export function AiSpinner({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'size-5' : 'size-7';
  return <span aria-hidden="true" className={cn('relative inline-grid shrink-0 place-items-center text-primary', box, className)}>
    <span className={cn('absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary motion-reduce:animate-none')} />
    <Sparkles className={cn('animate-pulse motion-reduce:animate-none', size === 'sm' ? 'size-2.5' : 'size-3.5')} />
  </span>;
}
