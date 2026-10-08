import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiRequest } from '../../lib/api';
import { useResource } from '../projects/useResource';
import { LoadingBlock, Notice, SectionCard } from './Field';

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
  const title = t('nav.tools'), description = t('tools.description');
  if (state.status === 'loading') return <SectionCard title={title} description={description}><LoadingBlock label={t('loading')} /></SectionCard>;
  if (state.status === 'error') return <SectionCard title={title} description={description} footer={<Button variant="outline" onClick={state.reload}>{t('retry')}</Button>}><Notice>{t('loadError')}</Notice></SectionCard>;
  async function update(next: boolean) {
    if (!connector || busy) return;
    setBusy(true); setError(false);
    setEnabled(next);
    try {
      await apiRequest<Connector>(`/projects/${project}/settings/tools/career_ops`, { method: 'PUT', body: JSON.stringify({ enabled: next }) });
      state.reload();
    } catch { setEnabled(!next); setError(true); }
    finally { setBusy(false); }
  }
  const on = enabled ?? connector?.enabled ?? false;
  return <SectionCard title={title} description={description}>
    {connector ? <div className="flex min-h-11 items-center gap-3 rounded-lg border p-3">
      <input id="career-ops" type="checkbox" className="size-5 accent-primary" checked={on} disabled={busy} onChange={event => void update(event.target.checked)} />
      <label htmlFor="career-ops" className="min-w-0 flex-1 text-sm font-medium">{t('careerOps')}</label>
      <Badge variant={on ? 'success' : 'secondary'}>{t(on ? 'enabled' : 'disabled')}</Badge>
    </div> : <p role="status" className="text-sm text-muted-foreground">{t('toolsUnavailable')}</p>}
    {error && <Notice>{t('saveFailed')}</Notice>}
  </SectionCard>;
}
