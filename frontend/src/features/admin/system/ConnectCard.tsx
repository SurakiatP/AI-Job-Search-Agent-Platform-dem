import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SectionCard } from '../../settings/Field';

// Opens the MCP / A2A listener that Connect (in a project console) needs. Moved here from the Connect tab, where only admins saw it.
const COMMAND = 'uv run --locked --project backend python scripts/run_local.py --enable-sharing --share-host 127.0.0.1 --share-port 8011';

export function ConnectCard() {
  const { t } = useTranslation('admin-system');
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function copy() {
    try { await navigator.clipboard.writeText(COMMAND); setState('ok'); } catch { setState('fail'); }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2500);
  }
  return <SectionCard title={t('connect.title')} description={t('connect.description')}>
    <pre className="overflow-x-auto rounded-lg border bg-muted p-3 text-xs" tabIndex={0} aria-label={t('connect.title')}><code>{COMMAND}</code></pre>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>{state === 'ok' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{t('connect.copy')}</Button>
      <span role="status" className={state === 'fail' ? 'text-xs text-destructive' : 'text-xs text-success'}>{state === 'ok' ? t('connect.copied') : state === 'fail' ? t('connect.copyFailed') : ''}</span>
    </div>
  </SectionCard>;
}
