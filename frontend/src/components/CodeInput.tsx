import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './ui/input';

// Six-digit emailed code: numeric keypad on phones, one-time-code autofill, digits only.
export function CodeInput({ value, onChange, className, ...props }: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & { value: string; onChange: (value: string) => void }) {
  return <Input {...props} value={value} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="••••••"
    onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
    className={cn('max-w-48 text-center text-xl font-semibold tracking-[0.5em] tabular-nums', className)} />;
}
