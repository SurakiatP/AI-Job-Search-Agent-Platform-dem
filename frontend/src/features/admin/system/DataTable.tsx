import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Table that turns into stacked "label: value" rows under 640 px, so nothing hides behind a sideways scroll. */
export function DataTable({ head, label, children }: { head: readonly string[]; label: string; children: ReactNode }) {
  return <table aria-label={label} className="w-full text-sm max-sm:block max-sm:min-w-0">
    <thead className="max-sm:sr-only"><tr className="border-b">{head.map((h, i) => <th key={i} scope="col" className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
    <tbody className="divide-y max-sm:block">{children}</tbody>
  </table>;
}

export function Tr({ onClick, children }: { onClick?: (row: HTMLTableRowElement) => void; children: ReactNode }) {
  return <tr onClick={onClick && (e => onClick(e.currentTarget))} className={cn('max-sm:block max-sm:py-3', onClick && 'cursor-pointer transition-colors hover:bg-muted/50')}>{children}</tr>;
}

export function Td({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <td data-label={label} className={cn('px-3 py-2.5 align-top max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-4 max-sm:px-0 max-sm:py-1 max-sm:before:shrink-0 max-sm:before:text-xs max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]', className)}>
    <div className="min-w-0 [overflow-wrap:anywhere] max-sm:text-end">{children}</div>
  </td>;
}
