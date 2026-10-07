import type { ReactNode } from 'react';

export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <section className="mx-auto my-12 flex max-w-xl flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-8">
    <h1 className="text-2xl font-semibold">{title}</h1>
    <p className="text-muted-foreground">{description}</p>
    {children && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
  </section>;
}
