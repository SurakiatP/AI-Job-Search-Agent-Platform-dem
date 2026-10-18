import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Decorative ring that turns while the system works; the words next to it carry the meaning.
// Reduced motion: the ring stays still and the label (and elapsed time) still say it is working.
export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden="true" className={cn('size-4 shrink-0 animate-spin motion-reduce:animate-none', className)} />;
}
