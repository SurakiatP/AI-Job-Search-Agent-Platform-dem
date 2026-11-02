import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// Page title block: stage-hued outline icon, serif title, muted lede, actions on the right.
export function PageHeader({ icon: Icon, title, lede, actions }: { icon?: LucideIcon; title: ReactNode; lede?: ReactNode; actions?: ReactNode }) {
  return <header className="workspace-page-header">
    <div className="min-w-0">
      <h1 className="flex items-start gap-3 text-2xl leading-[1.35] md:text-[34px]">
        {Icon && <span aria-hidden="true" className="flex h-[1.4em] shrink-0 items-center text-[color:var(--stage,var(--muted-foreground))]"><Icon className="size-6 md:size-7" strokeWidth={1.5} /></span>}
        <span className="min-w-0 break-words">{title}</span>
      </h1>
      {lede && <div className="mt-1 max-w-2xl md:mt-2 text-muted-foreground">{lede}</div>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}
