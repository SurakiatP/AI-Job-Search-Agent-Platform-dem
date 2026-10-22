import { PanelLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const sidebarShortcut = isMac ? '⇧⌘S' : 'Ctrl+Shift+S';

export function isSidebarShortcut(event: KeyboardEvent) {
  return event.shiftKey && (isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 's';
}

export function SidebarToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { i18n } = useTranslation();
  const label = i18n.language.startsWith('th') ? (open ? 'ซ่อนแถบข้าง' : 'แสดงแถบข้าง') : 'Toggle sidebar';
  return <span className="group relative inline-flex">
    <button type="button" onClick={onToggle} aria-label={label} aria-expanded={open} aria-keyshortcuts={isMac ? 'Meta+Shift+S' : 'Control+Shift+S'}
      className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <PanelLeft size={18} aria-hidden="true" />
    </button>
    <span role="tooltip" className={`pointer-events-none absolute z-50 hidden items-center ${open ? 'right-0 top-full mt-1.5' : 'left-full top-1/2 ml-2 -translate-y-1/2'} gap-2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background shadow group-hover:flex group-focus-within:flex`}>
      {label}<kbd className="rounded bg-background/20 px-1 font-sans">{sidebarShortcut}</kbd>
    </span>
  </span>;
}
