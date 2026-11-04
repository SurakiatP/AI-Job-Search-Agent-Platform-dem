import type { ComponentProps, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Severity = 'error' | 'warning' | 'success' | 'info';
const tone: Record<Severity, { fill: string; text: string; Icon: typeof Info }> = {
  error: { fill: 'bg-destructive/10', text: 'text-destructive', Icon: XCircle },
  warning: { fill: 'bg-warning/10', text: 'text-warning', Icon: AlertTriangle },
  success: { fill: 'bg-success/10', text: 'text-success', Icon: CheckCircle2 },
  info: { fill: 'bg-accent', text: 'text-primary', Icon: Info },
};

export function Alert({ severity = 'info', action, className, children, ...props }: ComponentProps<'div'> & { severity?: Severity; action?: ReactNode }) {
  const { fill, text, Icon } = tone[severity];
  return <div role={severity === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-lg px-4 py-1.5 text-sm text-foreground', fill, className)} {...props}>
    {/* The icon box is one text line tall (py-2 + line-height) so it centres on the first line of any message. */}
    <span className="flex h-[1.5rem] shrink-0 items-center self-start mt-2"><Icon className={cn('size-5', text)} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1 py-2 leading-6 [overflow-wrap:anywhere]">{children}</div>
    {action && <div className="shrink-0">{action}</div>}
  </div>;
}
