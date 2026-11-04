import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../app/providers';
import { useTheme } from '../../app/theme';
import type { Theme } from '../../app/theme';
import { Button } from '@/components/ui/button';
import { SectionCard } from './Field';

const themes = [['light', Sun], ['dark', Moon], ['system', Monitor]] as const;
const languages = [['th', 'ภาษาไทย', 'Thai'], ['en', 'English', 'อังกฤษ']] as const;
// Compact tiles that keep their own size (not stretched across the card). The selected one is shown by fill, border and
// ring; no tick mark.
const tile = 'h-auto min-h-16 min-w-28 flex-col gap-1.5 rounded-2xl px-6 py-3 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:ring-1 aria-pressed:ring-primary';

export function AppearanceSettings() {
  const { t } = useTranslation('settings');
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  return <SectionCard title={t('nav.appearance')} description={t('appearanceDescription')}>
    <div role="group" aria-labelledby="theme-heading" className="grid gap-2">
      <p id="theme-heading" className="text-sm font-medium">{t('themeHeading')}</p>
      <div className="flex flex-wrap gap-2">
        {themes.map(([value, Icon]) => <Button key={value} type="button" variant="outline" className={tile} aria-pressed={theme === value} aria-label={t('themeTile', { name: t(value) })} onClick={() => setTheme(value as Theme)}>
          <Icon className="size-5" aria-hidden="true" /><span>{t(value)}</span>
        </Button>)}
      </div>
    </div>
    <div role="group" aria-labelledby="language-heading" className="grid gap-2">
      <p id="language-heading" className="text-sm font-medium">{t('languageHeading')}</p>
      <div className="flex flex-wrap gap-2">
        {languages.map(([value, name, sub]) => <Button key={value} type="button" variant="outline" className={tile} aria-pressed={locale === value} lang={value} onClick={() => setLocale(value)}>
          <span>{name}</span><span className="text-xs font-normal text-muted-foreground" lang={value === 'th' ? 'en' : 'th'}>{sub}</span>
        </Button>)}
      </div>
    </div>
    <p className="text-sm text-muted-foreground">{t('appliesNow')}</p>
  </SectionCard>;
}
