import type { FormEvent, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const selectClass = 'flex min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

export function Field({ id, label, hint, children, className }: { id: string; label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-1.5', className)}>
    <Label htmlFor={id}>{label}</Label>
    {children}
    {hint && <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
  </div>;
}

// Inline status/error line; `ok` renders a polite status, otherwise an alert.
export function Notice({ ok, children }: { ok?: boolean; children: ReactNode }) {
  return <p role={ok ? 'status' : 'alert'} className={cn('text-sm', ok ? 'text-success' : 'text-destructive')}>{children}</p>;
}

export function LoadingBlock({ label }: { label: string }) {
  return <div role="status"><span className="sr-only">{label}</span><Skeleton className="h-24 w-full" /></div>;
}

export function SectionCard({ title, description, footer, onSubmit, children }: { title: string; description: string; footer?: ReactNode; onSubmit?: (event: FormEvent) => void; children: ReactNode }) {
  const body = <>
    <CardContent className="grid gap-5">{children}</CardContent>
    {footer && <CardFooter className="flex-wrap justify-end gap-2">{footer}</CardFooter>}
  </>;
  return <Card>
    <CardHeader><CardTitle role="heading" aria-level={2}>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
    {onSubmit ? <form onSubmit={onSubmit} className="grid gap-0">{body}</form> : body}
  </Card>;
}
