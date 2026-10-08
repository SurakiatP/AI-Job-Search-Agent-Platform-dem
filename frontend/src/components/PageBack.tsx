import type { ReactNode } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

// `history`: go back one entry when the app has history, else follow `to`.
export function PageBack({ to, children, history = false }: { to: string; children: ReactNode; history?: boolean }) {
  const navigate = useNavigate();
  return <Link className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline" to={to}
    onClick={history ? event => { if ((window.history.state as { idx?: number } | null)?.idx) { event.preventDefault(); navigate(-1); } } : undefined}>
    <ArrowLeft className="size-4" aria-hidden="true" />{children}
  </Link>;
}

export function Breadcrumb({ label, items }: { label: string; items: { label: string; to?: string }[] }) {
  return <nav aria-label={label}><ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
    {items.map((item, index) => <li key={index} className="flex min-w-0 items-center gap-1">
      {index > 0 && <ChevronRight className="size-4 shrink-0" aria-hidden="true" />}
      {item.to ? <Link className="max-w-48 truncate hover:text-foreground hover:underline" to={item.to} title={item.label}>{item.label}</Link> : <span className="max-w-48 truncate" aria-current="page" title={item.label}>{item.label}</span>}
    </li>)}
  </ol></nav>;
}
