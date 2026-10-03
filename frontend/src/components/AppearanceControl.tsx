import { useTranslation } from 'react-i18next';
import { useTheme } from '../app/theme';
import { Button } from './Button';

export function AppearanceControl() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  return <div className="appearance-control" role="group" aria-label={t('appearance')}>
    {(['light', 'dark', 'system'] as const).map(value => (
      <Button key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}>{t(value)}</Button>
    ))}
  </div>;
}
