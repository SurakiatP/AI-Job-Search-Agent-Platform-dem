import type { ReactNode } from 'react';

export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <section className="empty-state"><h1>{title}</h1><p className="muted">{description}</p>{children}</section>;
}
