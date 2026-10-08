import type { ButtonHTMLAttributes } from 'react';
import { Button as UiButton } from './ui/button';

const variants = { primary: 'default', secondary: 'outline', plain: 'ghost' } as const;

export function Button({ variant = 'secondary', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'plain' }) {
  return <UiButton type={type} variant={variants[variant]} {...props} />;
}
