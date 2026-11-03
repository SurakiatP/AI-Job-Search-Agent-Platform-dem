import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// Marks anything the AI agent produces or is working on. Decorative: the words beside it say what it is.
export function AiMark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return <span aria-hidden="true" className={cn('inline-grid shrink-0 place-items-center rounded-full bg-ai-soft text-ai', size === 'sm' ? 'size-5' : 'size-7', className)}>
    <span className={cn('font-semibold leading-none tracking-tight', size === 'sm' ? 'text-[9px]' : 'text-[11px]')}>AI</span>
  </span>;
}

// The mark with a ring that turns around it while the agent is processing.
export function AiSpinner({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'size-5' : 'size-7';
  return <span aria-hidden="true" className={cn('relative inline-grid shrink-0 place-items-center text-ai', box, className)}>
    <span className={cn('absolute inset-0 animate-spin rounded-full border-2 border-ai/20 border-t-ai motion-reduce:animate-none')} />
    <span className={cn('font-semibold leading-none', size === 'sm' ? 'text-[8px]' : 'text-[10px]')}>AI</span>
  </span>;
}

// Says in words that content came from AI (owner rule 2026-10-20). Use on every AI output; never on numbers
// the platform computes itself (keyword coverage). `check` adds "check before use" for text the user sends on.
export function AiLabel({ kind = 'made', check = false, className }: { kind?: 'made' | 'extracted'; check?: boolean; className?: string }) {
  const { t } = useTranslation();
  // w-fit + justify/self-start: a pill, never stretched by a grid or flex-column parent.
  return <span className={cn('inline-flex h-6 w-fit shrink-0 items-center gap-1 self-start justify-self-start whitespace-nowrap rounded-full bg-ai/10 px-2 text-xs font-medium leading-none text-ai-foreground dark:bg-ai/20', className)}>
    <Sparkles className="size-3.5 shrink-0 text-ai" aria-hidden="true" />
    <span>{t(`ai.${kind}`)}</span>
    {check && <><span className="h-3 w-px bg-current opacity-30" aria-hidden="true" /><span className="font-normal text-muted-foreground">{t('ai.check')}</span></>}
  </span>;
}
