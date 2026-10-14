import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Power, Send, Trash2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { apiRequest } from '../../lib/api';
import { ApiError, type WebhookDeliveryView, type WebhookEvent, type WebhookView } from '../../lib/api-types';
import { sendJson, useResource } from '../projects/useResource';
import { Field, LoadingBlock, Notice, SectionCard } from './Field';

const EVENTS: WebhookEvent[] = ['run.waiting_approval', 'run.needs_input', 'run.completed', 'run.failed', 'run.cancelled', 'digest.ready'];

const copy = {
  th: {
    title: 'Webhook', description: 'รับการแจ้งเตือนแบบ push ที่ลงลายเซ็น HMAC เมื่องานของเอเจนต์เปลี่ยนสถานะหรือมีสรุปงานใหม่',
    url: 'URL ปลายทาง', urlHint: 'ต้องเป็น https', events: 'เหตุการณ์', add: 'เพิ่ม webhook', loading: 'กำลังโหลด webhook',
    secretTitle: 'secret สำหรับตรวจลายเซ็น', secretOnce: 'secret นี้แสดงเพียงครั้งเดียว คัดลอกเก็บไว้ตอนนี้', secretDone: 'บันทึกแล้ว',
    verify: 'ตรวจลายเซ็น: คำนวณ HMAC-SHA256(secret, "<t>.<body>") แล้วเทียบกับค่า v1 ใน header X-JSP-Signature',
    empty: 'ยังไม่มี webhook', deliveries: 'การส่งล่าสุด', noDeliveries: 'ยังไม่มีการส่ง',
    test: (u: string) => `ส่งทดสอบไปที่ ${u}`, enabled: (u: string) => `เปิดใช้: ${u}`, remove: (u: string) => `ลบ ${u}`,
    redeliver: (e: string) => `ส่งใหม่ ${e}`, deleteTitle: (u: string) => `ลบ webhook “${u}”?`, deleteBody: 'จะไม่มีการส่งไปที่ URL นี้อีก', deleteConfirm: 'ลบ webhook',
    status: { pending: 'รอส่ง', delivered: 'ส่งแล้ว', dead: 'ล้มเหลว' }, cols: ['เหตุการณ์', 'สถานะ', 'HTTP', 'ครั้ง', 'เวลา', 'การทำงาน'],
    copy: 'คัดลอก', copied: 'คัดลอกแล้ว', copyFail: 'คัดลอกไม่สำเร็จ ลองเลือกข้อความแล้วคัดลอกเอง', loadError: 'โหลดข้อมูลไม่สำเร็จ', retry: 'ลองอีกครั้ง',
    labels: { 'run.waiting_approval': 'รออนุมัติ', 'run.needs_input': 'รอข้อมูล', 'run.completed': 'งานเสร็จ', 'run.failed': 'งานล้มเหลว', 'run.cancelled': 'งานถูกยกเลิก', 'digest.ready': 'สรุปงานใหม่พร้อม' } as Record<WebhookEvent, string>,
    errors: { invalid_webhook_url: 'URL ต้องเป็น https และชี้ไปยังเซิร์ฟเวอร์สาธารณะ', webhook_limit: 'เพิ่มได้สูงสุด 5 webhook ต่อโปรเจกต์', delivery_not_dead: 'ส่งใหม่ได้เฉพาะรายการที่ล้มเหลว' } as Record<string, string>,
    error: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง',
  },
  en: {
    title: 'Webhooks', description: 'Receive HMAC-signed push notifications when agent tasks change state or a digest is ready.',
    url: 'Endpoint URL', urlHint: 'Must be https.', events: 'Events', add: 'Add webhook', loading: 'Loading webhooks',
    secretTitle: 'Signing secret', secretOnce: 'This secret is shown only once. Copy it now.', secretDone: 'Done, I saved it',
    verify: 'Verify a request: compute HMAC-SHA256(secret, "<t>.<body>") and compare it with v1 in the X-JSP-Signature header.',
    empty: 'No webhooks yet', deliveries: 'Recent deliveries', noDeliveries: 'No deliveries yet',
    test: (u: string) => `Send test to ${u}`, enabled: (u: string) => `Enabled: ${u}`, remove: (u: string) => `Delete ${u}`,
    redeliver: (e: string) => `Redeliver ${e}`, deleteTitle: (u: string) => `Delete webhook “${u}”?`, deleteBody: 'Nothing will be sent to this URL again.', deleteConfirm: 'Delete webhook',
    status: { pending: 'Pending', delivered: 'Delivered', dead: 'Failed' }, cols: ['Event', 'Status', 'HTTP', 'Attempts', 'Time', 'Actions'],
    copy: 'Copy', copied: 'Copied', copyFail: 'Could not copy. Select the text and copy it yourself.', loadError: 'Could not load this information.', retry: 'Try again',
    labels: { 'run.waiting_approval': 'Waiting for approval', 'run.needs_input': 'Needs input', 'run.completed': 'Run completed', 'run.failed': 'Run failed', 'run.cancelled': 'Run cancelled', 'digest.ready': 'Digest ready' } as Record<WebhookEvent, string>,
    errors: { invalid_webhook_url: 'The URL must use https and point to a public server.', webhook_limit: 'You can add up to 5 webhooks per project.', delivery_not_dead: 'Only failed deliveries can be redelivered.' } as Record<string, string>,
    error: 'Something went wrong. Try again.',
  },
};

export function WebhookSettings({ projectId }: { projectId: string }) {
  const locale = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const base = `/projects/${projectId}/webhooks`;
  const hooks = useResource<WebhookView[]>(base);
  const deliveries = useResource<WebhookDeliveryView[]>(`${base}/deliveries`);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copyState, setCopyState] = useState<'' | 'ok' | 'fail'>('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<WebhookView | null>(null);
  const when = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { await action(); hooks.reload(); deliveries.reload(); }
    catch (error) { setMessage({ ok: false, text: (error instanceof ApiError && c.errors[error.code]) || c.error }); }
    finally { setBusy(false); }
  }
  async function copySecret() {
    try { await navigator.clipboard.writeText(secret ?? ''); setCopyState('ok'); } catch { setCopyState('fail'); }
  }
  async function add() {
    await run(async () => {
      const created = await sendJson<WebhookView & { secret: string }>(base, 'POST', { url: url.trim(), events });
      setSecret(created.secret); setUrl(''); setEvents([]);
    });
  }

  if (hooks.status === 'loading' && !hooks.data) return <LoadingBlock label={c.loading} />;
  return <SectionCard title={c.title} description={c.description}>
    {secret && <div className="grid gap-2 rounded-md border border-warning p-3">
      <p className="text-sm font-semibold">{c.secretTitle}</p>
      <code className="break-all rounded bg-muted p-2 text-sm">{secret}</code>
      <p className="text-sm text-warning">{c.secretOnce}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" className="min-h-10" onClick={() => void copySecret()}>{copyState === 'ok' ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}{c.copy}</Button>
        <Button variant="outline" onClick={() => { setSecret(null); setCopyState(''); }}>{c.secretDone}</Button>
        <span role="status" className={`text-sm ${copyState === 'fail' ? 'text-destructive' : 'text-success'}`}>{copyState === 'ok' ? c.copied : copyState === 'fail' ? c.copyFail : ''}</span>
      </div>
    </div>}
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); if (url.trim() && events.length) void add(); }}>
      <Field id="webhook-url" label={c.url} hint={c.urlHint}>
        <Input id="webhook-url" type="url" inputMode="url" maxLength={2048} value={url} onChange={event => setUrl(event.target.value)} required />
      </Field>
      <fieldset className="grid gap-1"><legend className="mb-1 text-sm font-medium">{c.events}</legend>
        <div className="grid gap-1 sm:grid-cols-2">{EVENTS.map(event => <label key={event} className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={events.includes(event)} onChange={e => setEvents(prev => e.target.checked ? [...prev, event] : prev.filter(x => x !== event))} />{c.labels[event]}
        </label>)}</div>
      </fieldset>
      {message && <Notice ok={message.ok}>{message.text}</Notice>}
      <div><Button type="submit" disabled={busy || !url.trim() || !events.length}>{c.add}</Button></div>
    </form>
    <p className="text-sm text-muted-foreground">{c.verify}</p>
    {hooks.status === 'error' ? <div className="flex flex-wrap items-center gap-2"><Notice>{c.loadError}</Notice><Button variant="outline" onClick={hooks.reload}>{c.retry}</Button></div> :
    (hooks.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{c.empty}</p> :
      <ul className="grid gap-2">{(hooks.data ?? []).map(hook => <li key={hook.id} className="grid min-w-0 gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="break-all text-sm font-medium">{hook.url}</p>
          <div className="mt-1 flex flex-wrap gap-1">{hook.events.map(e => <Badge key={e} variant="secondary">{c.labels[e]}</Badge>)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" aria-pressed={hook.enabled} aria-label={c.enabled(hook.url)} disabled={busy}
            onClick={() => void run(() => sendJson(`${base}/${hook.id}`, 'PATCH', { enabled: !hook.enabled }))}><Power className="size-4" aria-hidden="true" /></Button>
          <Button variant="outline" size="icon" aria-label={c.test(hook.url)} disabled={busy}
            onClick={() => void run(() => sendJson(`${base}/${hook.id}/test`, 'POST', {}))}><Send className="size-4" aria-hidden="true" /></Button>
          <Button variant="ghost" size="icon" aria-label={c.remove(hook.url)} onClick={() => setDeleting(hook)}><Trash2 className="size-4" aria-hidden="true" /></Button>
        </div>
      </li>)}</ul>}
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold">{c.deliveries}</h3>
      {deliveries.status === 'error' ? <div className="flex flex-wrap items-center gap-2"><Notice>{c.loadError}</Notice><Button variant="outline" onClick={deliveries.reload}>{c.retry}</Button></div> :
      (deliveries.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{c.noDeliveries}</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-sm">
          <thead><tr>{c.cols.map((col, i) => <th key={i} scope="col" className="px-2 py-1 font-medium text-muted-foreground">{i === c.cols.length - 1 ? <span className="sr-only">{col}</span> : col}</th>)}</tr></thead>
          <tbody>{(deliveries.data ?? []).map(d => <tr key={d.id} className="border-t">
            <td className="px-2 py-1">{d.event_type}</td>
            <td className="px-2 py-1">{c.status[d.status]}</td>
            <td className="px-2 py-1">{d.last_status_code ?? d.last_error ?? '—'}</td>
            <td className="px-2 py-1">{d.attempts}</td>
            <td className="px-2 py-1">{when.format(new Date(d.created_at))}</td>
            <td className="px-2 py-1">{d.status === 'dead' && <Button variant="ghost" size="icon" aria-label={c.redeliver(d.event_type)} disabled={busy}
              onClick={() => void run(() => sendJson(`${base}/deliveries/${d.id}/redeliver`, 'POST', {}))}><RotateCcw className="size-4" aria-hidden="true" /></Button>}</td>
          </tr>)}</tbody>
        </table></div>}
    </div>
    {deleting && <ConfirmDeleteDialog title={c.deleteTitle(deleting.url)} description={c.deleteBody} confirmLabel={c.deleteConfirm}
      onConfirm={() => apiRequest(`${base}/${deleting.id}`, { method: 'DELETE' }).then(() => undefined)}
      onDone={() => { setDeleting(null); hooks.reload(); deliveries.reload(); }} onClose={() => setDeleting(null)} />}
  </SectionCard>;
}
