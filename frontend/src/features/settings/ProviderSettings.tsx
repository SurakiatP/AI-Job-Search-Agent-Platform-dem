import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';
import { useResource } from '../projects/useResource';
import { Field, LoadingBlock, Notice, SectionCard, selectClass } from './Field';
import { parseCurl } from './parseCurl';

type Entry = { id: string; label: string; default_base_url: string | null; requires_base_url: boolean; local: boolean; key_optional: boolean };
type ProviderView = { provider: string | null; provider_label?: string | null; model: string | null; base_url?: string | null; configured: boolean; revision: number | null; masked_secret: string | null };
type TestView = { status: 'succeeded' | 'failed' | 'unavailable'; message_key: string; checked_at: string; duration_ms: number };
type ModelItem = { id: string; name: string | null };
type Message = { ok: boolean; text: string } | null;

const POPULAR = ['openai', 'anthropic', 'openrouter', 'gemini'];
const KNOWN_ERRORS = ['invalid_base_url', 'credential_required', 'provider_models_unavailable', 'secret_store_unavailable', 'unsupported_provider'];
// Used only if GET /providers is unreachable, so the form still works for the original providers.
const FALLBACK: Entry[] = ['openai', 'anthropic', 'openrouter'].map(id => ({ id, label: { openai: 'OpenAI', anthropic: 'Anthropic', openrouter: 'OpenRouter' }[id]!, default_base_url: null, requires_base_url: false, local: false, key_optional: false }));

const hostOf = (url: string | null) => { try { return url ? new URL(url).host : ''; } catch { return ''; } };

function baseUrlProblem(value: string): 'https' | 'invalid' | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]' || u.hostname.endsWith('.localhost');
    if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return null;
    return u.protocol === 'http:' ? 'https' : 'invalid';
  } catch { return 'invalid'; }
}

export function ProviderSettings({ projectId }: { projectId: string }) {
  const { t } = useTranslation('settings');
  const project = encodeURIComponent(projectId);
  const catalogState = useResource<{ providers: Entry[] }>('/providers');
  const providerState = useResource<ProviderView>(`/projects/${project}/settings/provider`);
  const catalog = catalogState.data?.providers ?? (catalogState.status === 'error' ? FALLBACK : []);
  const [provider, setProvider] = useState('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [credential, setCredential] = useState('');
  const [models, setModels] = useState<ModelItem[]>([]);
  const [curlText, setCurlText] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'models' | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [curlMessage, setCurlMessage] = useState<Message>(null);

  const entry = catalog.find(item => item.id === provider);
  const ready = catalogState.status !== 'loading' && providerState.status === 'ready';
  useEffect(() => {
    const data = providerState.data;
    if (!data || !catalog.length) return;
    const saved = catalog.find(item => item.id === data.provider);
    setProvider(saved?.id ?? 'openai');
    setBaseUrl(data.base_url ?? saved?.default_base_url ?? '');
    setModel(data.model ?? '');
  }, [providerState.data, catalogState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = t('nav.provider'), description = t('provider.description');
  if (!ready) {
    if (providerState.status === 'error') return <SectionCard title={title} description={description} footer={<Button variant="outline" onClick={providerState.reload}>{t('retry')}</Button>}><Notice>{t('loadError')}</Notice></SectionCard>;
    return <SectionCard title={title} description={description}><LoadingBlock label={t('loading')} /></SectionCard>;
  }

  const showBase = !!entry && (entry.requires_base_url || entry.local);
  const keyOptional = !!entry?.key_optional;
  const defaultBase = entry?.default_base_url ?? '';
  const trimmedBase = baseUrl.trim();
  const sentBase = showBase || trimmedBase !== defaultBase ? trimmedBase : '';
  const problem = baseUrlProblem(trimmedBase);
  const canSave = !!entry && !!model.trim() && (keyOptional || !!credential) && (!entry.requires_base_url || !!trimmedBase) && !problem;
  const errorText = (error: unknown) => error instanceof ApiError && KNOWN_ERRORS.includes(error.code) ? t(`error.${error.code}`) : t('saveFailed');

  function changeProvider(id: string) {
    const next = catalog.find(item => item.id === id);
    setProvider(id); setBaseUrl(next?.default_base_url ?? ''); setCredential(''); setModels([]); setModel(''); setMessage(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !canSave) return;
    setBusy('save'); setMessage(null);
    try {
      await apiRequest<ProviderView>(`/projects/${project}/settings/provider`, { method: 'PUT', body: JSON.stringify({ provider, model: model.trim(), ...(credential ? { credential } : {}), ...(sentBase ? { base_url: sentBase } : {}) }) });
      setCredential('');
      providerState.reload();
      setMessage({ ok: true, text: t('saved') });
    } catch (error) { setMessage({ ok: false, text: errorText(error) }); }
    finally { setBusy(null); }
  }

  async function testConnection() {
    setBusy('test'); setMessage(null);
    try {
      const result = await apiRequest<TestView>(`/projects/${project}/settings/provider/test`, { method: 'POST' });
      setMessage({ ok: result.status === 'succeeded', text: t(result.status === 'succeeded' ? 'connection.succeeded' : result.status === 'unavailable' ? 'connection.unavailable' : 'connection.failed') });
    } catch (error) { setMessage({ ok: false, text: errorText(error) }); }
    finally { setBusy(null); }
  }

  async function loadModels() {
    setBusy('models'); setMessage(null);
    try {
      const result = await apiRequest<{ models: ModelItem[] }>(`/projects/${project}/settings/provider/models`, { method: 'POST', body: JSON.stringify({ provider, base_url: sentBase || null, credential: credential || null }) });
      setModels(result.models);
    } catch (error) {
      setModels([]);
      setMessage({ ok: false, text: error instanceof ApiError && error.code === 'credential_required' ? t('needKeyForModels') : errorText(error) });
    } finally { setBusy(null); }
  }

  // Parsed entirely in the browser; the pasted text is cleared and never logged or sent.
  function importCurl() {
    const found = parseCurl(curlText);
    const filled: string[] = [];
    let next = entry;
    if (found.baseUrl) {
      next = catalog.find(item => item.default_base_url === found.baseUrl) ?? catalog.find(item => item.id !== 'custom' && hostOf(item.default_base_url) === hostOf(found.baseUrl!)) ?? catalog.find(item => item.id === 'custom') ?? entry;
      if (next && next.id !== provider) { setProvider(next.id); setModels([]); setModel(''); }
      setBaseUrl(found.baseUrl); filled.push(t('fieldUrl'));
    }
    if (found.credential && !next?.key_optional) { setCredential(found.credential); filled.push(t('apiKey')); }
    if (found.model) { setModel(found.model); filled.push(t('modelLabel')); }
    if (!filled.length) { setCurlMessage({ ok: false, text: t('curlNothing') }); return; }
    setCurlText(''); setMessage(null);
    setCurlMessage({ ok: true, text: t('curlFilled', { fields: filled.join(', ') }) });
  }

  const groups: [string, Entry[]][] = [
    [t('group.popular'), POPULAR.map(id => catalog.find(item => item.id === id)).filter((item): item is Entry => !!item)],
    [t('group.other'), catalog.filter(item => !POPULAR.includes(item.id) && !item.local && item.id !== 'custom')],
    [t('group.local'), catalog.filter(item => item.local)],
    [t('group.custom'), catalog.filter(item => item.id === 'custom')],
  ];
  const data = providerState.data;
  const baseField = <Field id="provider-base-url" label={t('baseUrl')} hint={t('baseUrlHint')}>
    <Input id="provider-base-url" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} required={entry?.requires_base_url} aria-invalid={!!problem} aria-describedby="provider-base-url-hint provider-base-url-problem" />
    {problem && <p id="provider-base-url-problem" className="text-sm text-destructive">{t(problem === 'https' ? 'baseUrlHttps' : 'baseUrlInvalid')}</p>}
  </Field>;

  return <SectionCard title={title} description={description} onSubmit={save}
    footer={<>
      <Button type="button" variant="outline" onClick={() => void testConnection()} disabled={!!busy || !data?.configured}>{t('testConnection')}</Button>
      <Button type="submit" disabled={!!busy || !canSave}>{t('saveProvider')}</Button>
    </>}>
    <p role="status" className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">{data?.configured ? t('configured', { provider: data.provider_label ?? data.provider, model: data.model, secret: data.masked_secret }) : t('notConfigured')}</p>

    <details className="rounded-lg border">
      <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-sm font-medium">{t('curlSummary')}</summary>
      <div className="grid gap-3 border-t p-3">
        <Field id="curl-input" label={t('curlLabel')} hint={t('curlHint')}>
          <Textarea id="curl-input" rows={4} spellCheck={false} autoComplete="off" className="font-mono text-sm" placeholder={t('curlPlaceholder')} value={curlText} onChange={event => { setCurlText(event.target.value); setCurlMessage(null); }} />
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {curlMessage && <div className="mr-auto min-w-0"><Notice ok={curlMessage.ok}>{curlMessage.text}</Notice></div>}
          <Button type="button" variant="outline" disabled={!curlText.trim()} onClick={importCurl}>{t('curlExtract')}</Button>
        </div>
      </div>
    </details>

    <Field id="provider-name" label={t('providerLabel')}>
      <select id="provider-name" className={selectClass} value={provider} onChange={event => changeProvider(event.target.value)}>
        {groups.filter(([, items]) => items.length).map(([label, items]) => <optgroup key={label} label={label}>{items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}
      </select>
    </Field>

    {showBase ? baseField : <details open={!!entry && trimmedBase !== defaultBase}>
      <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium text-muted-foreground">{t('advancedBaseUrl')}</summary>
      <div className="pt-1">{baseField}</div>
    </details>}

    {keyOptional ? <p className="text-sm text-muted-foreground">{t('keyNotNeeded', { provider: entry?.label })}</p> :
      <Field id="provider-key" label={t('apiKey')} hint={t('keyHint')}>
        <Input id="provider-key" type="password" autoComplete="new-password" spellCheck={false} value={credential} onChange={event => setCredential(event.target.value)} maxLength={4096} required />
      </Field>}

    <Field id="provider-model" label={t('modelLabel')} hint={models.length ? t('modelsFound', { count: models.length }) : t('modelHint')}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="provider-model" list="provider-model-options" autoComplete="off" spellCheck={false} value={model} onChange={event => setModel(event.target.value)} maxLength={160} required className="sm:flex-1" />
        <Button type="button" variant="outline" disabled={!!busy || !!problem} onClick={() => void loadModels()}>{t('loadModels')}</Button>
      </div>
      <datalist id="provider-model-options">{models.map(item => <option key={item.id} value={item.id} label={item.name ?? undefined} />)}</datalist>
    </Field>

    <p className="text-sm text-muted-foreground">{t('privacyNote')}{provider === 'custom' && ` ${t('customKeyNote')}`}</p>
    {message && <Notice ok={message.ok}>{message.text}</Notice>}
  </SectionCard>;
}
