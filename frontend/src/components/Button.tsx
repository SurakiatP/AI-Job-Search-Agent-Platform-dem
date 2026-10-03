import type { ButtonHTMLAttributes } from 'react';

export function Button({ className = '', variant = 'secondary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'plain' }) {
  return <button type="button" className={`button button-${variant} ${className}`} {...props} />;
}
