import { Skeleton } from '@/components/ui/skeleton';

export function EmptyHint({ title, hint }: { title: string; hint: string }) {
  return <div className="grid gap-1 px-6 py-10 text-center"><p className="font-medium">{title}</p><p className="mx-auto max-w-md text-sm text-muted-foreground">{hint}</p></div>;
}

/** Page-shaped placeholder: flow strip, tabs, table rows. */
export function PageSkeleton({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="grid gap-4"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-11 w-full max-w-md" />
    <div className="grid gap-3 rounded-2xl border p-5">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}</div></div>;
}
