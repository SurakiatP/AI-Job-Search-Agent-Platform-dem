import type { ComponentType } from 'react';
import { Ban, Bot, Check, FileCheck2, Pause, Play, RotateCcw, ShieldCheck, Sparkles, Target, Clock, X, CircleDot } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { Locale, RunEvent, RunStatus } from '../../lib/api-types';

type Tone = 'done' | 'warn' | 'bad';
type Step = { key: string; icon: ComponentType<{ className?: string }>; label: string; detail?: string; at: string; tone: Tone };

const text: Record<Locale, Record<string, string>> = {
  th: {
    queued: 'เข้าคิวแล้ว', started: 'เริ่มทำงานแล้ว', planning: 'เอเจนต์กำลังอ่านข้อมูลและวางแผน', thinking: 'AI กำลังคิดและเขียน',
    approved: 'คุณอนุมัติแล้ว', rejected: 'คุณไม่อนุมัติ', auto: 'อนุมัติอัตโนมัติตามที่คุณตั้งไว้', completed: 'เสร็จแล้ว', failed: 'ทำไม่สำเร็จ',
    cancelled: 'ยกเลิกแล้ว', cancelAsked: 'กำลังขอหยุดงาน รอการยืนยัน', interrupted: 'หยุดกลางทาง', resumed: 'ทำต่อหลังระบบรีสตาร์ท',
    recorded: 'บันทึกว่าสมัครงานแล้ว', working: 'กำลังดำเนินการ', progress: 'ความคืบหน้า',
  },
  en: {
    queued: 'Queued', started: 'Started working', planning: 'The agent is reading your data and planning', thinking: 'AI is thinking and writing',
    approved: 'You approved', rejected: 'You declined', auto: 'Approved automatically, as you set', completed: 'Done', failed: 'Did not finish',
    cancelled: 'Cancelled', cancelAsked: 'Asking it to stop, waiting for confirmation', interrupted: 'Stopped midway', resumed: 'Continued after a system restart',
    recorded: 'Recorded as applied', working: 'Working', progress: 'Progress',
  },
};

const rounds = (locale: Locale, n: number) => locale === 'th' ? `คิดไปแล้ว ${n} รอบ` : `${n} ${n === 1 ? 'round' : 'rounds'} so far`;
const tailorLabel = (locale: Locale, n: number | null | undefined) => locale === 'th' ? `ปรับ CV${n ? ` รอบที่ ${n}` : ''}` : `Tailoring your CV${n ? `, round ${n}` : ''}`;
const coverageText = (locale: Locale, ratio: number | null | undefined) => typeof ratio === 'number' ? (locale === 'th' ? `ทักษะที่ตรงกับประกาศ ${Math.round(ratio * 100)}%` : `${Math.round(ratio * 100)}% of the posting's skills covered`) : undefined;

// Turns raw run events into a short list a person can read; repeated technical steps are merged into one line.
export function buildSteps(events: RunEvent[], locale: Locale): Step[] {
  const t = text[locale];
  const steps: Step[] = [];
  const push = (step: Step) => {
    const last = steps[steps.length - 1];
    if (last && last.key === step.key && (step.key === 'planning' || step.key === 'thinking')) {
      const count = step.key === 'thinking' ? Number(last.detail?.match(/\d+/)?.[0] ?? 1) + 1 : undefined;
      steps[steps.length - 1] = { ...step, detail: step.key === 'thinking' && count ? rounds(locale, count) : undefined };
      return;
    }
    steps.push(step);
  };
  for (const event of events) {
    const at = event.created_at, step = event.data.step;
    const add = (key: string, icon: Step['icon'], label: string, tone: Tone = 'done', detail?: string) => push({ key, icon, label, detail, at, tone });
    switch (event.event_type) {
      case 'run_queued': add('queued', Clock, t.queued); break;
      case 'run_started': add('started', Play, t.started); break;
      case 'run_resumed': add('resumed', RotateCcw, t.resumed, 'warn'); break;
      case 'run_completed': add('completed', Check, t.completed); break;
      case 'run_failed': add('failed', X, t.failed, 'bad'); break;
      case 'run_cancelled': add('cancelled', Ban, t.cancelled, 'warn'); break;
      case 'run_cancel_requested': add('cancel-asked', Pause, t.cancelAsked, 'warn'); break;
      case 'run_interrupted': add('interrupted', Pause, t.interrupted, 'bad'); break;
      case 'approval_approved': add(`approved-${event.sequence}`, ShieldCheck, t.approved); break;
      case 'approval_rejected': add(`rejected-${event.sequence}`, X, t.rejected, 'warn'); break;
      case 'application_recorded': add('recorded', FileCheck2, t.recorded); break;
      default:
        if (step === 'agent_running') add('planning', Bot, t.planning);
        else if (step === 'llm_round') add('thinking', Sparkles, t.thinking, 'done', rounds(locale, 1));
        else if (step === 'tailor_round') add(`tailor-${event.sequence}`, Target, tailorLabel(locale, event.data.round), 'done', coverageText(locale, event.data.coverage));
        else if (step === 'autopilot_approved') add('auto', ShieldCheck, t.auto);
        // Unknown steps keep their own words when they are sentences; code-like names fall back to a neutral label.
        else if (step && /\s/.test(step)) add(`step-${event.sequence}`, CircleDot, step);
        else add(`step-${event.sequence}`, CircleDot, t.working);
    }
  }
  return steps;
}

const tones: Record<Tone, string> = {
  done: 'border-success/40 bg-success/10 text-success',
  warn: 'border-warning/50 bg-warning/10 text-warning',
  bad: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export function RunSteps({ events, locale, status }: { events: RunEvent[]; locale: Locale; status: RunStatus }) {
  const steps = buildSteps(events, locale);
  if (!steps.length) return null;
  const working = status === 'queued' || status === 'running';
  const time = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return <ol aria-label={text[locale].progress} className="grid">
    {steps.map((step, index) => {
      const current = working && index === steps.length - 1;
      const Icon = step.icon;
      return <li key={`${step.key}:${index}`} className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
        {index < steps.length - 1 && <span aria-hidden="true" className="absolute start-[0.8125rem] top-7 bottom-0 w-px bg-border" />}
        <span aria-hidden="true" className={cn('relative grid size-7 place-items-center rounded-full border', current ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_18%,transparent)]' : tones[step.tone])}>
          {current ? <Spinner className="size-3.5" /> : <Icon className="size-3.5" />}
        </span>
        <div className="min-w-0 pt-0.5">
          <p className={cn('break-words text-sm leading-snug', current ? 'font-semibold' : 'font-medium')}>{step.label}</p>
          {step.detail && <p className="mt-0.5 break-words text-xs text-muted-foreground">{step.detail}</p>}
          <time dateTime={step.at} className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{time.format(new Date(step.at))}</time>
        </div>
      </li>;
    })}
  </ol>;
}
