import { useId, useState } from 'react';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface TypedConfirmProps {
  /** The exact text the admin has to type (an email, "delete", a model name). */
  phrase: string;
  /** Visible label above the field, e.g. "Type the email to confirm". */
  label: string;
  /** Said once when the text matches ("Matches"). */
  matchedLabel: string;
  /** Called with true when the trimmed text equals the phrase, false otherwise. Enable the action button from this. */
  onMatchChange: (matched: boolean) => void;
  /** Match without regard to case. Default false. */
  ignoreCase?: boolean;
  className?: string;
}

/** Text field that unlocks a dangerous action only when the admin types the given phrase. The phrase is shown so it can be copied by eye, not pasted blindly. */
export function TypedConfirm({ phrase, label, matchedLabel, onMatchChange, ignoreCase = false, className }: TypedConfirmProps) {
  const id = useId();
  const [text, setText] = useState('');
  const norm = (s: string) => (ignoreCase ? s.trim().toLowerCase() : s.trim());
  const matched = text !== '' && norm(text) === norm(phrase);
  return <div className={cn('grid gap-1.5', className)}>
    <label htmlFor={id} className="text-sm font-medium">{label}</label>
    <p className="text-sm"><code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em] [overflow-wrap:anywhere]">{phrase}</code></p>
    <div className="relative">
      <Input id={id} value={text} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-describedby={`${id}-s`}
        className={cn(matched && 'border-success pr-10')} onChange={e => { setText(e.target.value); onMatchChange(e.target.value !== '' && norm(e.target.value) === norm(phrase)); }} />
      {matched ? <Check className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-success" aria-hidden="true" /> : null}
    </div>
    <p id={`${id}-s`} role="status" className="min-h-5 text-sm text-success">{matched ? matchedLabel : ''}</p>
  </div>;
}
