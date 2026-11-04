import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Bell, CheckCircle2, MessageCircleQuestion, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useLocale } from '../app/providers';
import { relativeTime } from '../features/console/shared';
import { apiRequest } from '../lib/api';
import type { Locale, NotificationKind, NotificationList, NotificationView, RunOperation } from '../lib/api-types';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Snackbar } from './ui/snackbar';

/** RunIndicator fires this when a run leaves the active state, so the bell re-reads at once instead of waiting 30 s. */
export const RUN_SETTLED_EVENT = 'jsp:run-settled';

const words = {
  th: { title: 'การแจ้งเตือน', unread: 'ยังไม่อ่าน', markAll: 'อ่านทั้งหมดแล้ว', empty: 'ยังไม่มีการแจ้งเตือน', emptyHint: 'งานที่ AI ทำเสร็จจะแจ้งที่นี่', open: 'เปิด', thisJob: 'งานนี้' },
  en: { title: 'Notifications', unread: 'unread', markAll: 'Mark all as read', empty: 'No notifications yet', emptyHint: 'Work the AI finishes will show up here', open: 'Open', thisJob: 'this job' },
} satisfies Record<Locale, Record<string, string>>;

type Pair = Record<Locale, string>;
const done: Partial<Record<RunOperation, (job: string) => Pair>> = {
  evaluate_job: job => ({ th: `ประเมิน ${job} เสร็จแล้ว`, en: `Fit score ready for ${job}` }),
  draft_documents: job => ({ th: `ร่างเอกสารสำหรับ ${job} เสร็จแล้ว`, en: `Documents drafted for ${job}` }),
  tailor_cv: job => ({ th: `ปรับ CV สำหรับ ${job} เสร็จแล้ว`, en: `CV changes ready for ${job}` }),
  apply_prepare: job => ({ th: `เตรียมคำตอบใบสมัคร ${job} เสร็จแล้ว`, en: `Application answers ready for ${job}` }),
  extract_experience: () => ({ th: 'อ่าน CV เสร็จแล้ว', en: 'Finished reading your CV' }),
  profile_cv: () => ({ th: 'อ่าน CV เสร็จแล้ว', en: 'Finished reading your CV' }),
  interview_generate: job => ({ th: `ชุดคำถามซ้อมสัมภาษณ์ ${job} พร้อมแล้ว`, en: `Practice questions ready for ${job}` }),
  interview_report: job => ({ th: `สรุปผลการซ้อมสัมภาษณ์ ${job} พร้อมแล้ว`, en: `Practice summary ready for ${job}` }),
  draft_follow_up: job => ({ th: `ร่างข้อความติดตามผล ${job} เสร็จแล้ว`, en: `Follow-up drafted for ${job}` }),
};
const task: Partial<Record<RunOperation, Pair>> = {
  evaluate_job: { th: 'การประเมินงาน', en: 'Fit score' }, draft_documents: { th: 'การร่างเอกสาร', en: 'Drafting documents' },
  tailor_cv: { th: 'การปรับ CV', en: 'CV tailoring' }, apply_prepare: { th: 'การเตรียมคำตอบใบสมัคร', en: 'Application answers' },
  extract_experience: { th: 'การอ่าน CV', en: 'Reading your CV' }, profile_cv: { th: 'การอ่าน CV', en: 'Reading your CV' },
  interview_generate: { th: 'การสร้างคำถามซ้อม', en: 'Practice questions' }, interview_report: { th: 'การสรุปผลการซ้อม', en: 'Practice summary' },
  draft_follow_up: { th: 'การร่างข้อความติดตามผล', en: 'Follow-up draft' },
};
const fallbackTask: Pair = { th: 'งาน AI', en: 'AI task' };

export function notificationSentence(n: NotificationView, locale: Locale): string {
  const d = n.data;
  const job = d.job_title ? (d.job_company ? `${d.job_title} · ${d.job_company}` : d.job_title) : words[locale].thisJob;
  const name = (task[d.operation as RunOperation] ?? fallbackTask)[locale];
  switch (n.kind) {
    case 'run_completed': return (done[d.operation as RunOperation]?.(job) ?? { th: `${name} เสร็จแล้ว`, en: `${name} finished` })[locale];
    case 'run_failed': return locale === 'th' ? `${name} ไม่สำเร็จ แตะเพื่อลองใหม่` : `${name} did not finish. Open to try again`;
    case 'run_needs_input': return locale === 'th' ? `${name} รอคำตอบจากคุณ` : `${name} waiting for your answer`;
    case 'run_waiting_approval': return locale === 'th' ? 'มีงานรอให้คุณอนุมัติ' : 'An action is waiting for your approval';
    default: return locale === 'th' ? `มีงานใหม่ ${d.count ?? 0} ตำแหน่งจากการค้นหา “${d.saved_search_name ?? ''}”` : `${d.count ?? 0} new jobs for “${d.saved_search_name ?? ''}”`;
  }
}

export function notificationLink(n: NotificationView): string {
  const { operation, session_id: sid, practice_set_id: practice } = n.data;
  const base = `/app/projects/${n.project_id}`;
  if (n.kind === 'digest_ready') return `${base}/search`;
  if (n.kind === 'run_waiting_approval') return `${base}/console?tab=approvals`;
  if (operation === 'extract_experience' || operation === 'profile_cv') return `${base}/profile`;
  if (!sid) return `${base}/console?tab=runs`;
  if (operation === 'interview_generate' || operation === 'interview_report') return practice ? `${base}/sessions/${sid}/practice/${practice}` : `${base}/sessions/${sid}?tab=practice`;
  if (n.kind === 'run_needs_input' && operation === 'apply_prepare') return `${base}/sessions/${sid}?tab=answers`;
  if (n.kind === 'run_needs_input' && operation === 'tailor_cv') return `${base}/sessions/${sid}?tab=documents`;
  return `${base}/sessions/${sid}`;
}

const tones: Record<NotificationKind, [LucideIcon, string]> = {
  run_completed: [CheckCircle2, 'bg-success/12 text-success'],
  run_failed: [AlertTriangle, 'bg-destructive/12 text-destructive'],
  run_needs_input: [MessageCircleQuestion, 'bg-warning/12 text-warning'],
  run_waiting_approval: [ShieldCheck, 'bg-warning/12 text-warning'],
  digest_ready: [Sparkles, 'bg-primary/12 text-primary'],
};

type State = { list: NotificationList; bump: number; markRead: (ids: string[] | 'all') => void };
const Context = createContext<State | null>(null);
const POLL_MS = 30_000;

/** One poller for the whole shell (the sidebar and the phone bar each render a bell); also owns the "new notification" snackbar. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [list, setList] = useState<NotificationList>({ items: [], unread_count: 0 });
  const [bump, setBump] = useState(0);
  const [toast, setToast] = useState<NotificationView | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const count = useRef(0);
  const here = useRef('');
  here.current = pathname + search;

  const load = useCallback(() => {
    apiRequest<NotificationList>('/notifications?limit=30').then(next => {
      if (!Array.isArray(next?.items)) return;
      if (seen.current) {
        const fresh = next.items.filter(n => !n.read_at && !seen.current!.has(n.id));
        // No snackbar when the person already stands on the page the notification opens.
        const shown = fresh.find(n => notificationLink(n) !== here.current && notificationLink(n).split('?')[0] !== here.current);
        if (shown) setToast(shown);
      }
      if (next.unread_count > count.current && seen.current) setBump(value => value + 1);
      seen.current = new Set(next.items.map(n => n.id));
      count.current = next.unread_count;
      setList(next);
    }, () => undefined); // a failed poll keeps what is shown; the next one retries
  }, []);

  useEffect(() => {
    load();
    const tick = () => { if (document.visibilityState === 'visible') load(); };
    const timer = window.setInterval(tick, POLL_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener(RUN_SETTLED_EVENT, load);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); window.removeEventListener(RUN_SETTLED_EVENT, load); };
  }, [load]);

  const markRead = useCallback((ids: string[] | 'all') => {
    setList(current => {
      const items = current.items.map(n => (ids === 'all' || ids.includes(n.id)) && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n);
      count.current = items.filter(n => !n.read_at).length;
      return { items, unread_count: count.current };
    });
    apiRequest<{ unread_count: number }>('/notifications/read', { method: 'POST', body: JSON.stringify(ids === 'all' ? { all: true } : { ids }) }).then(() => undefined, load);
  }, [load]);

  const open = () => { if (!toast) return; markRead([toast.id]); navigate(notificationLink(toast)); setToast(null); };
  return <Context.Provider value={{ list, bump, markRead }}>
    {children}
    <Snackbar open={!!toast} message={toast ? notificationSentence(toast, locale) : ''} onClose={() => setToast(null)}
      action={<Button type="button" variant="ghost" size="sm" onClick={open}>{words[locale].open}</Button>} />
  </Context.Provider>;
}

export function NotificationBell() {
  const state = useContext(Context);
  const { locale } = useLocale();
  if (!state) return null;
  const w = words[locale];
  const { list, bump, markRead } = state;
  const n = list.unread_count;
  const label = n ? `${w.title}${locale === 'th' ? `, ${w.unread} ${n}` : `, ${n} ${w.unread}`}` : w.title;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="icon" className="relative shrink-0 overflow-visible" aria-label={label}>
        <Bell className="size-5" aria-hidden="true" />
        {n > 0 && <span key={bump} aria-hidden="true" data-pop={bump > 0 || undefined} className="notif-badge absolute -end-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium leading-none tabular-nums text-primary-foreground">{n > 9 ? '9+' : n}</span>}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8} collisionPadding={8} className="notif-panel flex max-h-[min(70dvh,32rem)] w-[min(92vw,24rem)] max-w-none flex-col rounded-2xl p-0">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b py-1 ps-4 pe-2">
        <h2 className="text-sm font-medium">{w.title}</h2>
        <DropdownMenuItem disabled={n === 0} className="min-h-9 shrink-0 rounded-full px-3 text-xs text-primary data-[disabled]:opacity-50" onSelect={event => { event.preventDefault(); markRead('all'); }}>{w.markAll}</DropdownMenuItem>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {list.items.length === 0 ? <div className="grid gap-1 px-4 py-8 text-center"><p className="text-sm font-medium">{w.empty}</p><p className="text-xs text-muted-foreground">{w.emptyHint}</p></div>
          : list.items.map(item => <NotificationRow key={item.id} item={item} locale={locale} markRead={markRead} />)}
      </div>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function NotificationRow({ item, locale, markRead }: { item: NotificationView; locale: Locale; markRead: State['markRead'] }) {
  const [Icon, tone] = tones[item.kind] ?? tones.run_completed;
  const unread = !item.read_at;
  return <DropdownMenuItem asChild className="items-start gap-3 py-2">
    <Link to={notificationLink(item)} className="text-foreground" onClick={() => unread && markRead([item.id])}>
      <span aria-hidden="true" className={cn('mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full', tone)}><Icon className="size-4" /></span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={cn('text-sm leading-snug [overflow-wrap:anywhere]', unread ? 'font-medium' : 'font-normal text-muted-foreground')}>{notificationSentence(item, locale)}</span>
        <time dateTime={item.created_at} className="text-xs text-muted-foreground">{relativeTime(item.created_at, Date.now(), locale).replace('ที่ผ่านมา', 'ที่แล้ว')}</time>
      </span>
      {unread && <><span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-primary" /><span className="sr-only">{words[locale].unread}</span></>}
    </Link>
  </DropdownMenuItem>;
}
