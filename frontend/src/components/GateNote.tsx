import { Info } from 'lucide-react';
import { useRunGate } from '@/lib/accountGate';
import { cn } from '@/lib/utils';

// The visible reason for a disabled AI button (a title tooltip alone never shows on touch). Renders nothing when not gated.
export function GateNote({ className }: { className?: string }) {
  const gate = useRunGate();
  if (!gate.blocked || !gate.title) return null;
  return <p className={cn('flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground', className)} data-testid="gate-note"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{gate.title}</span></p>;
}
