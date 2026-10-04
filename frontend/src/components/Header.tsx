import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../app/providers';
import { Button } from './Button';

export function Header({ menu, actions }: { menu?: ReactNode; actions?: ReactNode }) {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  return (
    <header className={actions ? 'app-header has-actions' : 'app-header'}>
      <div className="header-identity">{menu}<span className="app-name">AI Job Search Agent Platform</span></div>
      <div className="header-actions">
        {actions}
      <div className="language-switch" role="group" aria-label={t('language')}>
        <Button variant="plain" aria-pressed={locale === 'th'} onClick={() => setLocale('th')}>ไทย</Button>
        <Button variant="plain" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</Button>
      </div>
      </div>
    </header>
  );
}
