import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from './ui/input';

// Password field with an eye toggle so people can check what they typed.
export function PasswordInput({ className, type: _type, ...props }: ComponentProps<'input'>) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return <div className="relative">
    <Input type={visible ? 'text' : 'password'} className={cn('pr-11', className)} {...props} />
    <button type="button" aria-label={t('auth.showPassword')} aria-pressed={visible} aria-controls={props.id} onClick={() => setVisible(v => !v)}
      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Icon className="size-4" aria-hidden="true" />
    </button>
  </div>;
}
