import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppearanceSettings } from './AppearanceSettings';
import { ProviderSettings } from './ProviderSettings';
import { ToolSettings } from './ToolSettings';
import { ProjectSharing } from './ProjectSharing';
import { useResource } from '../projects/useResource';
import { LoadingState, ErrorState } from '../projects/PageStates';
import { Link } from 'react-router';
import { PageBack } from '../../components/PageBack';

type SettingsTab = 'appearance' | 'providers' | 'sharing';

export function SettingsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SettingsTab>('appearance');
  const projects = useResource<Array<{ id: string; name: string }>>('/projects');
  const [selectedProject, setSelectedProject] = useState('');
  const projectId = projects.data?.some(item => item.id === selectedProject) ? selectedProject : projects.data?.[0]?.id ?? '';
  if (projects.status === 'loading') return <LoadingState />;
  if (projects.status === 'error') return <ErrorState onRetry={projects.reload} />;
  const tabs: { id: SettingsTab; label: string; description: string }[] = [
    { id: 'appearance', label: t('pages.appearanceTab', { defaultValue: 'Appearance' }), description: t('pages.appearanceDescription', { defaultValue: 'Choose how the application looks on this device.' }) },
    { id: 'providers', label: t('pages.providersTab', { defaultValue: 'Providers and tools' }), description: t('settings:provider.description') },
    { id: 'sharing', label: t('pages.sharingTab', { defaultValue: 'Project sharing' }), description: t('settings:sharing.description') },
  ];
  const selected = tabs.find(item => item.id === tab)!;
  return <section className="page-wrap"><PageBack to="/app" history>{t('back', { defaultValue: 'Back' })}</PageBack><h1>{t('pages.settingsTitle', { defaultValue: 'Settings' })}</h1><div className="settings-tabs" role="tablist" aria-label={t('pages.settingsTitle', { defaultValue: 'Settings' })}>{tabs.map(item => <button key={item.id} id={`settings-tab-${item.id}`} className="settings-tab" type="button" role="tab" aria-selected={tab === item.id} aria-controls="settings-panel" onClick={() => setTab(item.id)}>{item.label}</button>)}</div><section id="settings-panel" className="surface-card" role="tabpanel" aria-labelledby={`settings-tab-${tab}`}><h2>{selected.label}</h2><p>{selected.description}</p>{tab === 'appearance' && <AppearanceSettings />}{tab !== 'appearance' && <><label htmlFor="settings-project">{t('pages.project')}</label><select id="settings-project" value={projectId} onChange={event => setSelectedProject(event.target.value)}>{projects.data?.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>{!projectId && <Link to="/app/projects/new">{t('pages.createProject')}</Link>}{projectId && (tab === 'providers' ? <><ProviderSettings key={`provider:${projectId}`} projectId={projectId} /><ToolSettings key={`tools:${projectId}`} projectId={projectId} /></> : <ProjectSharing key={`sharing:${projectId}`} projectId={projectId} />)}</>}</section></section>;
}
