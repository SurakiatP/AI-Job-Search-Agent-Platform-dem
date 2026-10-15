import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { apiRequest } from '../../lib/api';
import { ApiError, type TelegramLinkView, type TelegramStatusView } from '../../lib/api-types';
import { sendJson, useResource } from '../projects/useResource';
import { LoadingBlock, Notice, SectionCard } from './Field';

const POLL_MS = 3000;
const POLL_LIMIT_MS = 10 * 60 * 1000;

const copy = {
  th: {
    title: 'Telegram', description: 'รับสรุปงานใหม่ทาง Telegram ผ่านบอตของแพลตฟอร์ม เปิดลิงก์แล้วกด Start ในแชต',
    loading: 'กำลังโหลด Telegram', connect: 'เชื่อมต่อ Telegram', disconnect: 'ยกเลิกการเชื่อมต่อ',
    waiting: 'รอการยืนยันใน Telegram กด Start ในแชตที่เปิดขึ้น', timedOut: 'ลิงก์หมดอายุแล้ว กดเชื่อมต่อใหม่อีกครั้ง',
    connected: 'เชื่อมต่อแล้ว', connectedAs: (b: string) => `เชื่อมต่อแล้ว (บอต @${b})`, notConnected: 'ยังไม่ได้เชื่อมต่อ',
    deleteTitle: 'ยกเลิกการเชื่อมต่อ Telegram?', deleteBody: 'จะปิดการส่งทาง Telegram ในทุกการค้นหาที่บันทึกไว้', deleteConfirm: 'ยกเลิกการเชื่อมต่อ',
    loadError: 'โหลดข้อมูลไม่สำเร็จ', retry: 'ลองอีกครั้ง',
    errors: { telegram_unavailable: 'ติดต่อบอต Telegram ไม่ได้ในตอนนี้ ลองใหม่ภายหลัง', rate_limited: 'ขอลิงก์บ่อยเกินไป ลองใหม่ภายหลัง' } as Record<string, string>,
    error: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง',
  },
  en: {
    title: 'Telegram', description: 'Get new-job digests on Telegram through the platform bot. Open the link, then press Start in the chat.',
    loading: 'Loading Telegram', connect: 'Connect Telegram', disconnect: 'Disconnect',
    waiting: 'Waiting for you to press Start in Telegram.', timedOut: 'The link expired. Press Connect to get a new one.',
    connected: 'Connected', connectedAs: (b: string) => `Connected (bot @${b})`, notConnected: 'Not connected',
    deleteTitle: 'Disconnect Telegram?', deleteBody: 'Telegram digests will be switched off on every saved search.', deleteConfirm: 'Disconnect',
    loadError: 'Could not load this information.', retry: 'Try again',
    errors: { telegram_unavailable: 'The Telegram bot cannot be reached right now. Try again later.', rate_limited: 'Too many link requests. Try again later.' } as Record<string, string>,
    error: 'Something went wrong. Try again.',
  },
};

// Account-level channel: renders nothing when the server has no bot token.
export function TelegramSettings() {
  const locale = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const state = useResource<TelegramStatusView>('/account/telegram');
  const [status, setStatus] = useState<TelegramStatusView | null>(null);
  const [polling, setPolling] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const current = status ?? state.data ?? null;

  // Poll until the bot confirms the link, the code expires (10 min) or the card unmounts.
  useEffect(() => {
    if (!polling) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started >= POLL_LIMIT_MS) { setPolling(false); setTimedOut(true); return; }
      apiRequest<TelegramStatusView>('/account/telegram').then(next => { if (next.linked) { setStatus(next); setPolling(false); } }).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [polling]);

  async function connect() {
    if (busy) return;
    setBusy(true); setMessage(null); setTimedOut(false);
    try {
      const link = await sendJson<TelegramLinkView>('/account/telegram/link', 'POST', {});
      window.open(link.url, '_blank', 'noopener,noreferrer');
      setPolling(true);
    } catch (error) { setMessage((error instanceof ApiError && c.errors[error.code]) || c.error); }
    finally { setBusy(false); }
  }

  if (state.status === 'loading' && !current) return <LoadingBlock label={c.loading} />;
  if (state.status === 'error' && !current) return state.errorStatus === 404 ? null : <SectionCard title={c.title} description={c.description} footer={<Button variant="outline" onClick={state.reload}>{c.retry}</Button>}><Notice>{c.loadError}</Notice></SectionCard>;
  if (!current?.enabled) return null;
  return <SectionCard title={c.title} description={c.description}>
    <p role="status" className="text-sm">{current.linked ? (current.bot_username ? c.connectedAs(current.bot_username) : c.connected) : polling ? c.waiting : timedOut ? c.timedOut : c.notConnected}</p>
    {message && <Notice>{message}</Notice>}
    <div>{current.linked
      ? <Button variant="outline" className="min-h-10" disabled={busy} onClick={() => setConfirming(true)}>{c.disconnect}</Button>
      : <Button className="min-h-10" disabled={busy} onClick={() => void connect()}>{c.connect}</Button>}</div>
    {confirming && <ConfirmDeleteDialog title={c.deleteTitle} description={c.deleteBody} confirmLabel={c.deleteConfirm}
      onConfirm={() => apiRequest('/account/telegram', { method: 'DELETE' }).then(() => undefined)}
      onDone={() => { setConfirming(false); setStatus({ ...current, linked: false, linked_at: null }); }} onClose={() => setConfirming(false)} />}
  </SectionCard>;
}
