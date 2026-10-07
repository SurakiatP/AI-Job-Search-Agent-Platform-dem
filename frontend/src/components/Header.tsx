import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../app/providers';
import { AppearanceControl } from './AppearanceControl';
import { Button } from './ui/button';

export function Wordmark() {
  return <span className="flex min-w-0 items-center gap-2 text-sm font-semibold leading-snug">
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Sparkles aria-hidden="true" size={16} /></span>
    <span className="min-w-0 [overflow-wrap:anywhere]">AI Job Search Agent Platform</span>
  </span>;
}

export function LanguageSwitch() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  return <div className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label={t('language')}>
    {([['th', 'ไทย'], ['en', 'EN']] as const).map(([value, label]) => (
      <Button key={value} variant="ghost" size="sm" className="min-w-10 min-h-9" aria-pressed={locale === value} onClick={() => setLocale(value)}>{label}</Button>
    ))}
  </div>;
}

export function Header({ menu, actions }: { menu?: ReactNode; actions?: ReactNode }) {
  return <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/90 px-4 py-2 backdrop-blur sm:px-6">
    <div className="flex min-w-0 items-center gap-2">{menu}<Wordmark /></div>
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      {actions}
      <AppearanceControl compact />
      <LanguageSwitch />
    </div>
  </header>;
}
