import { CalendarClock, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { isRangeKey, RANGES, type RangeKey } from './range';

export interface RangeMenuProps {
  value: RangeKey;
  onChange: (range: RangeKey) => void;
  /** Visible text of an option, e.g. "Last 7 days". Translated by the caller. */
  labelFor: (range: RangeKey) => string;
  /** Name of the control, read before the current value ("Time range"). */
  menuLabel: string;
  className?: string;
}

/** The 12-option time range picker used on every admin page that has a range. */
export function RangeMenu({ value, onChange, labelFor, menuLabel, className }: RangeMenuProps) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className={className} aria-label={`${menuLabel}: ${labelFor(value)}`}>
        <CalendarClock className="size-4" aria-hidden="true" />{labelFor(value)}<ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-52">
      <DropdownMenuRadioGroup value={value} onValueChange={v => { if (isRangeKey(v)) onChange(v); }}>
        {RANGES.map(r => <DropdownMenuRadioItem key={r} value={r}>{labelFor(r)}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
