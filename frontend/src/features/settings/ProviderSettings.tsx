import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { apiRequest } from '../../lib/api';
import { useResource } from '../projects/useResource';

type ProviderView = { provider: 'openai' | 'anthropic' | 'openrouter' | null; model: string | null; configured: boolean; revision: number | null; masked_secret: string | null };
type TestView = { status: 'succeeded' | 'failed' | 'unavailable'; message_key: string; checked_at: string; duration_ms: number };

export function ProviderSettings({ projectId }: { projectId: string }) {
  const { t } = useTranslation('settings');
  const project = encodeURIComponent(projectId);
  const providerState = useResource<ProviderView>(`/projects/${project}/settings/provider`);
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'openrouter'>('openai');
  const [model, setModel] = useState('');
  const [credential, setCredential] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestView | null>(null);

  useEffect(() => {
    if (!providerState.data) return;
    if (providerState.data.provider === 'openai' || providerState.data.provider === 'anthropic' || providerState.data.provider === 'openrouter') setProvider(providerState.data.provider);
    setModel(providerState.data.model ?? '');
  }, [providerState.data]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !model.trim() || !credential) return;
    setBusy(true); setErrorKey(null); setTestState(null);
    try {
      await apiRequest<ProviderView>(`/projects/${project}/settings/provider`, { method: 'PUT', body: JSON.stringify({ provider, model: model.trim(), credential }) });
      setCredential('');
      providerState.reload();
    } catch { setErrorKey('saveFailed'); }
    finally { setBusy(false); }
  }

  async function testConnection() {
    setBusy(true); setErrorKey(null); setTestState(null);
    try { setTestState(await apiRequest<TestView>(`/projects/${project}/settings/provider/test`, { method: 'POST' })); }
    catch { setErrorKey('saveFailed'); }
    finally { setBusy(false); }
  }

  if (providerState.status === 'loading') return <p role="status">{t('loading')}</p>;
  if (providerState.status === 'error') return <div><p role="alert">{t('loadError')}</p><Button onClick={providerState.reload}>{t('retry')}</Button></div>;

  return <div className="settings-form">
    <p>{t('provider.description')}</p>
    <p role="status">{providerState.data?.configured ? t('configured', { provider: providerState.data.provider, model: providerState.data.model, secret: providerState.data.masked_secret }) : t('notConfigured')}</p>
    <form onSubmit={save}>
      <label htmlFor="provider-name">{t('providerLabel')}</label>
      <select id="provider-name" value={provider} onChange={event => setProvider(event.target.value as 'openai' | 'anthropic' | 'openrouter')}>
        <option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="openrouter">OpenRouter</option>
      </select>
      <label htmlFor="provider-model">{t('modelLabel')}</label>
      <input id="provider-model" value={model} onChange={event => setModel(event.target.value)} maxLength={160} required />
      <label htmlFor="provider-key">{t('apiKey')}</label>
      <input id="provider-key" type="password" autoComplete="new-password" value={credential} onChange={event => setCredential(event.target.value)} maxLength={4096} required={!providerState.data?.configured} />
      <p className="muted">{t('keyHint')}</p>
      <Button variant="primary" type="submit" disabled={busy || !model.trim() || !credential}>{t('saveProvider')}</Button>
    </form>
    {providerState.data?.configured && <Button onClick={() => void testConnection()} disabled={busy}>{t('testConnection')}</Button>}
    {errorKey && <p role="alert">{t(errorKey)}</p>}
    {testState && <p role="status">{t(testState.status === 'succeeded' ? 'connection.succeeded' : testState.status === 'unavailable' ? 'connection.unavailable' : 'connection.failed')}</p>}
  </div>;
}
