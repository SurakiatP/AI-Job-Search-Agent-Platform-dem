import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// Four-pointed sparkle in the Gemini hues. Decorative: the words beside it always say what it is.
export function GemSparkle({ className }: { className?: string }) {
  const id = useId();
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('shrink-0', className)}>
    <defs><linearGradient id={id} x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor="var(--gem-green)" /><stop offset="0.3" stopColor="var(--gem-blue)" /><stop offset="0.65" stopColor="var(--gem-violet)" /><stop offset="1" stopColor="var(--gem-rose)" />
    </linearGradient></defs>
    <path fill={`url(#${id})`} d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5Z" />
  </svg>;
}

// Marks anything the AI agent produces or is working on.
export function AiMark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return <span aria-hidden="true" className={cn('inline-grid shrink-0 place-items-center rounded-full bg-ai-soft', size === 'sm' ? 'size-5' : 'size-7', className)}>
    <GemSparkle className={size === 'sm' ? 'size-3' : 'size-4'} />
  </span>;
}

// The sparkle inside a turning four-colour ring while the agent is processing.
export function AiSpinner({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return <span aria-hidden="true" className={cn('relative inline-grid shrink-0 place-items-center', size === 'sm' ? 'size-5' : 'size-7', className)}>
    <span className="gem-ring absolute inset-0 rounded-full" />
    <GemSparkle className={size === 'sm' ? 'size-2.5' : 'size-3.5'} />
  </span>;
}

// Says in words that content came from AI (owner rule 2026-10-20). Use on every AI output; never on numbers
// the platform computes itself (keyword coverage). `check` adds "check before use" for text the user sends on.
export function AiLabel({ kind = 'made', check = false, className }: { kind?: 'made' | 'extracted'; check?: boolean; className?: string }) {
  const { t } = useTranslation();
  // w-fit + justify/self-start: a pill, never stretched by a grid or flex-column parent.
  return <span className={cn('inline-flex h-6 w-fit shrink-0 items-center gap-1 self-start justify-self-start whitespace-nowrap rounded-full bg-ai/10 px-2 text-xs font-medium leading-none text-ai-foreground dark:bg-ai/20', className)}>
    <GemSparkle className="size-3.5" />
    <span>{t(`ai.${kind}`)}</span>
    {check && <><span className="h-3 w-px bg-current opacity-30" aria-hidden="true" /><span className="font-normal text-muted-foreground">{t('ai.check')}</span></>}
  </span>;
}
