import { useTranslation } from 'react-i18next';
import { useTheme } from '../../app/theme';
import { Button } from '../../components/Button';

export function AppearanceSettings() {
  const { t } = useTranslation('settings');
  const { theme, setTheme } = useTheme();
  return <div className="settings-form">
    <p>{t('appearanceDescription')}</p>
    <div className="appearance-control" role="group" aria-label={t('appearance')}>
      {(['light', 'dark', 'system'] as const).map(value => <Button key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}>{t(value)}</Button>)}
    </div>
  </div>;
}
