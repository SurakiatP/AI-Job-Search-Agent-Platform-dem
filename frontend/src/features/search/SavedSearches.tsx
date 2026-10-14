import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, BellRing, Mail, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { apiRequest } from '../../lib/api';
import { ApiError, type DigestFrequency, type SavedSearchFilters, type SavedSearchList, type SavedSearchView, type WebhookView } from '../../lib/api-types';
import { selectClass } from '../settings/Field';
import { sendJson, useResource } from '../projects/useResource';
import { splitList } from './AdvancedFilters';

const LIST_KEYS = ['seniority', 'employment_type', 'company_type', 'skills'] as const;

const copy = {
  th: {
    title: 'การค้นหาที่บันทึกไว้', save: 'บันทึกการค้นหานี้', hint: 'ตั้งตัวกรองแล้วกด "บันทึกการค้นหานี้" เพื่อรับสรุปงานใหม่ทางอีเมล',
    saveTitle: 'บันทึกการค้นหา', saveHelp: 'เราจะส่งสรุปงานใหม่ที่ตรงตัวกรองนี้ไปที่อีเมลของคุณ เวลา 08:00 น.',
    name: 'ชื่อ', frequency: 'ความถี่', daily: 'ทุกวัน', weekly: 'ทุกสัปดาห์ (วันจันทร์)', cancel: 'ยกเลิก', confirmSave: 'บันทึก',
    saved: 'บันทึกการค้นหาแล้ว', previewSent: 'ส่งอีเมลตัวอย่างแล้ว', untitled: 'การค้นหาของฉัน',
    next: (d: string) => `สรุปครั้งถัดไป: ${d}`, off: 'ปิดอีเมลสรุปอยู่',
    frequencyFor: (n: string) => `ความถี่ของสรุป ${n}`, emailFor: (n: string) => `อีเมลสรุปของ ${n}`, pushFor: (n: string) => `ส่ง push สรุปของ ${n}`, pushHint: 'เพิ่ม webhook ที่เลือก "สรุปงานใหม่พร้อม" ในการตั้งค่าก่อน',
    previewFor: (n: string) => `ส่งตัวอย่างของ ${n}`, deleteFor: (n: string) => `ลบ ${n}`,
    deleteTitle: (n: string) => `ลบ “${n}”?`, deleteBody: 'การค้นหานี้และอีเมลสรุปจะถูกลบ', deleteConfirm: 'ลบการค้นหา',
    unverified: 'ยืนยันอีเมลก่อนจึงจะได้รับสรุปงาน', notificationsOff: 'โปรเจกต์นี้ปิดการแจ้งเตือนอยู่ เปิดได้ที่การตั้งค่าโปรเจกต์',
    errors: { saved_search_limit: 'บันทึกได้สูงสุด 10 การค้นหาต่อโปรเจกต์', saved_search_name_taken: 'ชื่อนี้ถูกใช้แล้ว', rate_limited: 'ส่งตัวอย่างบ่อยเกินไป ลองใหม่ภายหลัง', mail_unavailable: 'ส่งอีเมลไม่ได้ในตอนนี้', email_unverified: 'ยืนยันอีเมลก่อนจึงจะส่งตัวอย่างได้' } as Record<string, string>,
    error: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง',
  },
  en: {
    title: 'Saved searches', save: 'Save this search', hint: 'Set filters, then press "Save this search" to get new jobs by email.',
    saveTitle: 'Save search', saveHelp: 'We email you new jobs that match these filters at 08:00 (Bangkok time).',
    name: 'Name', frequency: 'Frequency', daily: 'Daily', weekly: 'Weekly', cancel: 'Cancel', confirmSave: 'Save',
    saved: 'Search saved', previewSent: 'Preview sent', untitled: 'My search',
    next: (d: string) => `Next digest: ${d}`, off: 'Email digest is off',
    frequencyFor: (n: string) => `Digest frequency for ${n}`, emailFor: (n: string) => `Email digest for ${n}`, pushFor: (n: string) => `Push digest for ${n}`, pushHint: 'Add a webhook subscribed to "Digest ready" in Settings first.',
    previewFor: (n: string) => `Send a preview of ${n}`, deleteFor: (n: string) => `Delete ${n}`,
    deleteTitle: (n: string) => `Delete “${n}”?`, deleteBody: 'This search and its email digest will be removed.', deleteConfirm: 'Delete search',
    unverified: 'Verify your email to receive digests', notificationsOff: 'Notifications are off for this project. Turn them on in project settings.',
    errors: { saved_search_limit: 'You can save up to 10 searches per project.', saved_search_name_taken: 'That name is already used.', rate_limited: 'Too many previews. Try again later.', mail_unavailable: 'Email cannot be sent right now.', email_unverified: 'Verify your email to send a preview.' } as Record<string, string>,
    error: 'Something went wrong. Try again.',
  },
};

export function filtersFromParams(params: URLSearchParams): SavedSearchFilters {
  const f: SavedSearchFilters = { q: params.get('q') ?? '', cities: splitList(params.get('cities') ?? '') };
  const mode = params.get('work_mode');
  if (mode === 'remote' || mode === 'hybrid' || mode === 'onsite') f.work_mode = mode;
  const category = params.get('category');
  if (category) f.category = category;
  for (const key of LIST_KEYS) { const values = splitList(params.get(key) ?? ''); if (values.length) f[key] = values; }
  if (params.get('posting_language') === 'th') f.posting_language = 'th';
  const salary = Number(params.get('salary_min'));
  if (Number.isInteger(salary) && salary > 0) f.salary_min = salary;
  return f;
}

export function paramsFromFilters(f: SavedSearchFilters): Record<string, string> {
  const out: Record<string, string> = {
    q: f.q ?? '', cities: (f.cities ?? []).join(','), work_mode: f.work_mode ?? '', category: f.category ?? '',
    posting_language: f.posting_language ?? '', salary_min: f.salary_min ? String(f.salary_min) : '', posted_within_days: '',
  };
  for (const key of LIST_KEYS) out[key] = (f[key] ?? []).join(',');
  return out;
}

export function SavedSearchesPanel({ projectId, params, onApply }: {
  projectId: string; params: URLSearchParams; onApply: (changes: Record<string, string>) => void;
}) {
  const locale = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const base = `/projects/${projectId}/saved-searches`;
  const f = filtersFromParams(params);
  const savable = Boolean(f.q || f.cities?.length || f.work_mode || f.category || f.posting_language || f.salary_min || LIST_KEYS.some(key => f[key]?.length));
  const list = useResource<SavedSearchList>(base);
  const hooks = useResource<WebhookView[]>(`/projects/${projectId}/webhooks`);
  const pushReady = (hooks.data ?? []).some(h => h.enabled && h.events.includes('digest.ready'));
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<DigestFrequency>('daily');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<SavedSearchView | null>(null);
  const items = list.data?.items ?? [];
  const status = list.data?.status;
  const when = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

  async function run(action: () => Promise<unknown>, ok?: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setMessage(null);
    try { await action(); if (ok) setMessage({ ok: true, text: ok }); list.reload(); return true; }
    catch (error) { setMessage({ ok: false, text: (error instanceof ApiError && c.errors[error.code]) || c.error }); return false; }
    finally { setBusy(false); }
  }
  function openSave() {
    setName((params.get('q') || params.get('category') || params.get('cities') || c.untitled).slice(0, 80));
    setFrequency('daily'); setMessage(null); setSaveOpen(true);
  }
  const notice = message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-success' : 'text-destructive'}`}>{message.text}</p>;

  return <section aria-labelledby="saved-searches-title" className="grid min-w-0 gap-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="saved-searches-title" className="text-base font-semibold">{c.title}</h2>
      <Button variant="outline" disabled={!savable} onClick={openSave}><Bookmark className="size-4" aria-hidden="true" />{c.save}</Button>
    </div>
    {!savable && items.length === 0 && <p className="text-sm text-muted-foreground">{c.hint}</p>}
    {status && !status.email_verified && <p role="status" className="text-sm text-warning">{c.unverified}</p>}
    {status && status.email_verified && !status.notifications_enabled && <p role="status" className="text-sm text-warning">{c.notificationsOff}</p>}
    {!saveOpen && notice}
    {items.length > 0 && <ul className="grid gap-2">{items.map(item => <li key={item.id} className="grid min-w-0 gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <button type="button" className="min-h-10 max-w-full break-words text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onApply(paramsFromFilters(item.filters))}>{item.name}</button>
        <p className="text-xs text-muted-foreground">{item.digest_enabled ? c.next(when.format(new Date(item.next_run_at))) : c.off}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={c.frequencyFor(item.name)} className={`${selectClass} w-auto`} value={item.frequency} disabled={busy}
          onChange={event => void run(() => sendJson(`${base}/${item.id}`, 'PATCH', { frequency: event.target.value }))}>
          <option value="daily">{c.daily}</option><option value="weekly">{c.weekly}</option>
        </select>
        <Button variant="outline" size="icon" aria-pressed={item.digest_enabled} aria-label={c.emailFor(item.name)} disabled={busy}
          onClick={() => void run(() => sendJson(`${base}/${item.id}`, 'PATCH', { digest_enabled: !item.digest_enabled }))}><Mail className="size-4" aria-hidden="true" /></Button>
        <Button variant="outline" size="icon" aria-pressed={item.push_enabled} aria-label={c.pushFor(item.name)} disabled={busy || (!pushReady && !item.push_enabled)}
          title={pushReady ? undefined : c.pushHint}
          onClick={() => void run(() => sendJson(`${base}/${item.id}`, 'PATCH', { push_enabled: !item.push_enabled }))}><BellRing className="size-4" aria-hidden="true" /></Button>
        <Button variant="outline" size="icon" aria-label={c.previewFor(item.name)} disabled={busy}
          onClick={() => void run(() => sendJson(`${base}/${item.id}/preview`, 'POST', {}), c.previewSent)}><Send className="size-4" aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" aria-label={c.deleteFor(item.name)} onClick={() => setDeleting(item)}><Trash2 className="size-4" aria-hidden="true" /></Button>
      </div>
    </li>)}</ul>}
    <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
      <DialogContent>
        <DialogTitle>{c.saveTitle}</DialogTitle>
        <DialogDescription>{c.saveHelp}</DialogDescription>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault();
          if (!name.trim()) return;
          void run(() => sendJson(base, 'POST', { name: name.trim(), filters: filtersFromParams(params), frequency }), c.saved).then(ok => { if (ok) setSaveOpen(false); });
        }}>
          <div className="grid gap-2"><Label htmlFor="saved-search-name">{c.name}</Label><Input id="saved-search-name" maxLength={80} value={name} onChange={event => setName(event.target.value)} required /></div>
          <fieldset className="grid gap-1"><legend className="mb-1 text-sm font-medium">{c.frequency}</legend>
            {(['daily', 'weekly'] as const).map(value => <label key={value} className="flex min-h-10 items-center gap-2 text-sm">
              <input type="radio" name="saved-search-frequency" value={value} checked={frequency === value} onChange={() => setFrequency(value)} />{value === 'daily' ? c.daily : c.weekly}
            </label>)}
          </fieldset>
          {saveOpen && message && !message.ok && notice}
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">{c.cancel}</Button></DialogClose>
            <Button type="submit" disabled={busy || !name.trim()}>{c.confirmSave}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    {deleting && <ConfirmDeleteDialog title={c.deleteTitle(deleting.name)} description={c.deleteBody} confirmLabel={c.deleteConfirm}
      onConfirm={() => apiRequest(`${base}/${deleting.id}`, { method: 'DELETE' }).then(() => undefined)}
      onDone={() => { setDeleting(null); list.reload(); }} onClose={() => setDeleting(null)} />}
  </section>;
}
