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
import adminShellEn from '../locales/admin-shell.en.json';
import adminShellTh from '../locales/admin-shell.th.json';
import adminOverviewEn from '../locales/admin-overview.en.json';
import adminOverviewTh from '../locales/admin-overview.th.json';
import adminUsersEn from '../locales/admin-users.en.json';
import adminUsersTh from '../locales/admin-users.th.json';
import adminRunsEn from '../locales/admin-runs.en.json';
import adminRunsTh from '../locales/admin-runs.th.json';
import adminUsageEn from '../locales/admin-usage.en.json';
import adminUsageTh from '../locales/admin-usage.th.json';
import adminModelsEn from '../locales/admin-models.en.json';
import adminModelsTh from '../locales/admin-models.th.json';
import adminSystemEn from '../locales/admin-system.en.json';
import adminSystemTh from '../locales/admin-system.th.json';
import adminAuditEn from '../locales/admin-audit.en.json';
import adminAuditTh from '../locales/admin-audit.th.json';
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
      resources: { th: { common: th, settings: settingsTh, searchWorkspace: searchTh, sessionWorkspace: sessionTh, materialsWorkspace: materialsTh, applicationsWorkspace: applicationsTh, utilitiesWorkspace: utilitiesTh, 'admin-shell': adminShellTh, 'admin-overview': adminOverviewTh, 'admin-users': adminUsersTh, 'admin-runs': adminRunsTh, 'admin-usage': adminUsageTh, 'admin-models': adminModelsTh, 'admin-system': adminSystemTh, 'admin-audit': adminAuditTh }, en: { common: en, settings: settingsEn, searchWorkspace: searchEn, sessionWorkspace: sessionEn, materialsWorkspace: materialsEn, applicationsWorkspace: applicationsEn, utilitiesWorkspace: utilitiesEn, 'admin-shell': adminShellEn, 'admin-overview': adminOverviewEn, 'admin-users': adminUsersEn, 'admin-runs': adminRunsEn, 'admin-usage': adminUsageEn, 'admin-models': adminModelsEn, 'admin-system': adminSystemEn, 'admin-audit': adminAuditEn } },
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
