import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '../app/theme';
import { Button } from './ui/button';

const options = [['light', Sun], ['dark', Moon], ['system', Monitor]] as const;

export function AppearanceControl({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  if (compact) {
    const Icon = options.find(([value]) => value === theme)![1];
    const next = options[(options.findIndex(([value]) => value === theme) + 1) % options.length][0] as Theme;
    return <Button variant="ghost" size="icon" aria-label={`${t('appearance')}: ${t(theme)}`} title={t(next)} onClick={() => setTheme(next)}><Icon aria-hidden="true" size={18} /></Button>;
  }
  return <div className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label={t('appearance')}>
    {options.map(([value, Icon]) => (
      <Button key={value} variant="ghost" size="icon" className="size-9 min-h-9" aria-label={t(value)} title={t(value)} aria-pressed={theme === value} onClick={() => setTheme(value)}><Icon aria-hidden="true" size={16} /></Button>
    ))}
  </div>;
}
