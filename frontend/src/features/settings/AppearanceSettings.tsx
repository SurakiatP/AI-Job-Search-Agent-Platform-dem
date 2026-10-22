import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../app/providers';
import { useTheme } from '../../app/theme';
import type { Theme } from '../../app/theme';
import { Button } from '@/components/ui/button';
import { SectionCard } from './Field';

const themes = [['light', Sun], ['dark', Moon], ['system', Monitor]] as const;
const languages = [['th', 'ภาษาไทย', 'Thai'], ['en', 'English', 'อังกฤษ']] as const;
const tile = 'relative h-auto min-h-20 flex-col gap-2 py-4 aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary';

function Selected() { return <Check className="absolute right-2 top-2 size-4 text-primary" aria-hidden="true" />; }

export function AppearanceSettings() {
  const { t } = useTranslation('settings');
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  return <SectionCard title={t('nav.appearance')} description={t('appearanceDescription')}>
    <div role="group" aria-labelledby="theme-heading" className="grid gap-2">
      <p id="theme-heading" className="text-sm font-medium">{t('themeHeading')}</p>
      <div className="grid grid-cols-3 gap-2">
        {themes.map(([value, Icon]) => <Button key={value} type="button" variant="outline" className={tile} aria-pressed={theme === value} aria-label={t('themeTile', { name: t(value) })} onClick={() => setTheme(value as Theme)}>
          <Icon className="size-5" aria-hidden="true" /><span>{t(value)}</span>{theme === value && <Selected />}
        </Button>)}
      </div>
    </div>
    <div role="group" aria-labelledby="language-heading" className="grid gap-2">
      <p id="language-heading" className="text-sm font-medium">{t('languageHeading')}</p>
      <div className="grid grid-cols-2 gap-2">
        {languages.map(([value, name, sub]) => <Button key={value} type="button" variant="outline" className={tile} aria-pressed={locale === value} lang={value} onClick={() => setLocale(value)}>
          <span>{name}</span><span className="text-xs font-normal text-muted-foreground" lang={value === 'th' ? 'en' : 'th'}>{sub}</span>{locale === value && <Selected />}
        </Button>)}
      </div>
    </div>
    <p className="text-sm text-muted-foreground">{t('appliesNow')}</p>
  </SectionCard>;
}
