import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppearanceControl } from '../../components/AppearanceControl';

type SettingsTab = 'appearance' | 'providers' | 'sharing';

export function SettingsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SettingsTab>('appearance');
  const tabs: { id: SettingsTab; label: string; description: string }[] = [
    { id: 'appearance', label: t('pages.appearanceTab', { defaultValue: 'Appearance' }), description: t('pages.appearanceDescription', { defaultValue: 'Choose how the application looks on this device.' }) },
    { id: 'providers', label: t('pages.providersTab', { defaultValue: 'Providers and tools' }), description: t('pages.providersDescription', { defaultValue: 'Provider and tool configuration will be available when secure settings are connected.' }) },
    { id: 'sharing', label: t('pages.sharingTab', { defaultValue: 'Project sharing' }), description: t('pages.sharingDescription', { defaultValue: 'Project sharing controls will appear when owner access is connected.' }) },
  ];
  const selected = tabs.find(item => item.id === tab)!;
  return <section className="page-wrap"><h1>{t('pages.settingsTitle', { defaultValue: 'Settings' })}</h1><div className="settings-tabs" role="tablist" aria-label={t('pages.settingsTitle', { defaultValue: 'Settings' })}>{tabs.map(item => <button key={item.id} id={`settings-tab-${item.id}`} className="settings-tab" type="button" role="tab" aria-selected={tab === item.id} aria-controls="settings-panel" onClick={() => setTab(item.id)}>{item.label}</button>)}</div><section id="settings-panel" className="surface-card" role="tabpanel" aria-labelledby={`settings-tab-${tab}`}><h2>{selected.label}</h2><p>{selected.description}</p>{tab === 'appearance' && <AppearanceControl />}</section></section>;
}
