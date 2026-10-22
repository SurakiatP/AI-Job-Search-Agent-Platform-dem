import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

export type ItemMenuAction = { label: string; icon: ReactNode; destructive?: boolean; onSelect: () => void };

// "..." options menu. `reveal` hides the trigger until the parent (.group) is hovered or focused, like the sidebar rows.
export function ItemMenu({ label, actions, reveal = false, className }: { label: string; actions: ItemMenuAction[]; reveal?: boolean; className?: string }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={label} className={cn(
        'grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
        reveal && 'opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100', className)}>
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52">
      {actions.map(action => <DropdownMenuItem key={action.label} className={action.destructive ? 'text-destructive data-[highlighted]:text-destructive' : undefined} onSelect={action.onSelect}>
        {action.icon}{action.label}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
