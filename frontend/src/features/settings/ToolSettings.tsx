import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { apiRequest } from '../../lib/api';
import { useResource } from '../projects/useResource';

type Connector = { adapter: 'career_ops'; enabled: boolean; revision: number; updated_at: string };
type ToolView = { connectors: Connector[] };

export function ToolSettings({ projectId }: { projectId: string }) {
  const { t } = useTranslation('settings');
  const project = encodeURIComponent(projectId);
  const state = useResource<ToolView>(`/projects/${project}/settings/tools`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const connector = state.data?.connectors.find(item => item.adapter === 'career_ops');
  useEffect(() => { if (connector) setEnabled(connector.enabled); }, [connector?.enabled]);
  if (state.status === 'loading') return <p role="status">{t('loading')}</p>;
  if (state.status === 'error') return <div><p role="alert">{t('loadError')}</p><Button onClick={state.reload}>{t('retry')}</Button></div>;
  async function update(enabled: boolean) {
    if (!connector || busy) return;
    setBusy(true); setError(false);
    setEnabled(enabled);
    try {
      await apiRequest<Connector>(`/projects/${project}/settings/tools/career_ops`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      state.reload();
    } catch { setEnabled(!enabled); setError(true); }
    finally { setBusy(false); }
  }
  return <div className="settings-form">
    <p>{t('tools.description')}</p>
    {connector ? <div className="check-row"><input id="career-ops" type="checkbox" checked={enabled ?? connector.enabled} disabled={busy} onChange={event => void update(event.target.checked)} /><label htmlFor="career-ops">{t('careerOps')}</label><span>{t((enabled ?? connector.enabled) ? 'enabled' : 'disabled')}</span></div> : <p role="status">{t('toolsUnavailable')}</p>}
    {error && <p role="alert">{t('saveFailed')}</p>}
  </div>;
}
