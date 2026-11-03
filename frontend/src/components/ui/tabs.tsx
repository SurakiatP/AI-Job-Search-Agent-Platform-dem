import { useEffect, useRef, type ComponentProps } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';
import { ripple } from '@/lib/ripple';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, children, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  const list = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const underline = !String(className ?? '').includes('segmented');
  useEffect(() => {
    const el = list.current;
    if (!el || !underline) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>('[data-state=active]');
      if (!on || !bar.current) return;
      bar.current.style.width = `${on.offsetWidth}px`;
      bar.current.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop + on.offsetHeight - 2}px)`;
    };
    place();
    const watch = new MutationObserver(place); watch.observe(el, { attributes: true, subtree: true, attributeFilter: ['data-state'] });
    const size = new ResizeObserver(place); size.observe(el);
    return () => { watch.disconnect(); size.disconnect(); };
  }, [underline]);
  return <TabsPrimitive.List ref={list} className={cn('relative flex flex-wrap items-center border-b border-border text-muted-foreground', className)} {...props}>
    {children}
    {underline && <span ref={bar} aria-hidden="true" className="tab-indicator pointer-events-none absolute left-0 top-0 h-0.5 bg-primary" />}
  </TabsPrimitive.List>;
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn('relative inline-flex min-h-12 shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium transition-colors hover:bg-primary/[0.04] hover:text-foreground data-[state=active]:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50', className)} onPointerDown={event => { ripple(event); props.onPointerDown?.(event); }} {...props} />;
}
export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} {...props} />;
}
