import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import th from '../locales/common.th.json';
import en from '../locales/common.en.json';
import settingsTh from '../locales/settings.th.json';
import settingsEn from '../locales/settings.en.json';
import searchEn from '../locales/search-workspace.en.json';
import searchTh from '../locales/search-workspace.th.json';
import sessionEn from '../locales/session-workspace.en.json';
import sessionTh from '../locales/session-workspace.th.json';
import materialsEn from '../locales/materials-workspace.en.json';
import materialsTh from '../locales/materials-workspace.th.json';
import applicationsEn from '../locales/applications-workspace.en.json';
import applicationsTh from '../locales/applications-workspace.th.json';
import utilitiesEn from '../locales/utilities-workspace.en.json';
import utilitiesTh from '../locales/utilities-workspace.th.json';
import { DraftProvider } from './drafts';
import { readPreference, savePreference, ThemeProvider } from './theme';

export type Locale = 'th' | 'en';
const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void } | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => readPreference('ui.locale', ['th', 'en'], 'th'));
  const [i18n] = useState(() => {
    const instance = i18next.createInstance();
    void instance.init({
      lng: locale, fallbackLng: 'th', fallbackNS: 'common', initAsync: false,
      resources: { th: { common: th, settings: settingsTh, searchWorkspace: searchTh, sessionWorkspace: sessionTh, materialsWorkspace: materialsTh, applicationsWorkspace: applicationsTh, utilitiesWorkspace: utilitiesTh }, en: { common: en, settings: settingsEn, searchWorkspace: searchEn, sessionWorkspace: sessionEn, materialsWorkspace: materialsEn, applicationsWorkspace: applicationsEn, utilitiesWorkspace: utilitiesEn } },
      defaultNS: 'common', interpolation: { escapeValue: false },
    });
    return instance;
  });
  useEffect(() => {
    void i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
    savePreference('ui.locale', locale);
  }, [i18n, locale]);
  return (
    <I18nextProvider i18n={i18n}>
      <LocaleContext.Provider value={{ locale, setLocale }}>
        <ThemeProvider><DraftProvider>{children}</DraftProvider></ThemeProvider>
      </LocaleContext.Provider>
    </I18nextProvider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale requires AppProviders');
  return context;
}
