import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ApplicationDetailView, ApplicationEventView, ApplicationStage } from '../../lib/api-types';
import { STAGES, stageLabel } from '../../lib/applicationStages';
import { selectClass } from '../settings/Field';
import { sendJson, useResource } from '../projects/useResource';

const copy = {
  th: {
    title: 'ใบสมัคร', stage: 'ขั้นตอน', contact: 'ผู้ติดต่อ (recruiter)', name: 'ชื่อผู้ติดต่อ', email: 'อีเมลผู้ติดต่อ', role: 'ตำแหน่งผู้ติดต่อ',
    saveContact: 'บันทึกผู้ติดต่อ', write: 'เขียนอีเมล', writeHelp: 'เปิดโปรแกรมอีเมลของคุณ ระบบไม่ส่งอีเมลเอง',
    log: 'บันทึกการติดต่อ', direction: 'ทิศทาง', sent: 'ส่งออก', received: 'ได้รับ', subject: 'หัวเรื่อง', date: 'วันที่', logNote: 'รายละเอียด (ไม่บังคับ)', logAction: 'บันทึกการติดต่อ',
    note: 'โน้ต', addNote: 'เพิ่มโน้ต', timeline: 'ไทม์ไลน์', empty: 'ยังไม่มีความเคลื่อนไหว', error: 'บันทึกไม่สำเร็จ ลองอีกครั้ง',
    actor: { user: 'คุณ', agent: 'เอเจนต์', system: 'ระบบ' },
    contactUpdated: 'อัปเดตผู้ติดต่อ', sentEmail: 'ส่งอีเมล', receivedEmail: 'ได้รับอีเมล', viaApproval: 'สมัครผ่านการอนุมัติ',
  },
  en: {
    title: 'Application', stage: 'Stage', contact: 'Recruiter contact', name: 'Recruiter name', email: 'Recruiter email', role: 'Recruiter role',
    saveContact: 'Save contact', write: 'Write email', writeHelp: 'Opens your own mail app. The platform never sends email.',
    log: 'Log correspondence', direction: 'Direction', sent: 'Sent', received: 'Received', subject: 'Subject', date: 'Date', logNote: 'Details (optional)', logAction: 'Log correspondence',
    note: 'Note', addNote: 'Add note', timeline: 'Timeline', empty: 'No activity yet', error: 'Could not save. Try again.',
    actor: { user: 'You', agent: 'Agent', system: 'System' },
    contactUpdated: 'Contact updated', sentEmail: 'Sent email', receivedEmail: 'Received email', viaApproval: 'Applied through approval',
  },
};

const today = () => new Date().toISOString().slice(0, 10);

export function mailtoHref(email: string, jobTitle: string): string {
  const [local, domain] = email.split('@');
  return `mailto:${encodeURIComponent(local)}@${domain}?subject=${encodeURIComponent(`Re: ${jobTitle}`)}`;
}

export function ApplicationPanel({ projectId, jobId, jobTitle, onStageChanged }: { projectId: string; jobId: string; jobTitle: string; onStageChanged: () => void }) {
  const locale = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const path = `/projects/${projectId}/jobs/${jobId}`;
  const result = useResource<ApplicationDetailView>(`${path}/application`);
  const [contact, setContact] = useState({ name: '', email: '', role: '' });
  const [log, setLog] = useState({ direction: 'sent', subject: '', occurred_on: today(), note: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const data = result.data;

  useEffect(() => {
    if (data) setContact({ name: data.contact.name ?? '', email: data.contact.email ?? '', role: data.contact.role ?? '' });
  }, [data]);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (busy) return;
    setBusy(true); setError(false);
    try { await action(); after?.(); result.reload(); } catch { setError(true); } finally { setBusy(false); }
  }
  const blank = (value: string) => value.trim() || null;
  const describe = (event: ApplicationEventView): string => {
    const p = event.payload as Record<string, string | null>;
    switch (event.kind) {
      case 'stage_changed': return `${stageLabel[p.from as ApplicationStage][locale]} → ${stageLabel[p.to as ApplicationStage][locale]}`;
      case 'note': return p.text ?? '';
      case 'contact_updated': return [c.contactUpdated, p.name, p.email].filter(Boolean).join(' · ');
      case 'email_logged': return `${p.direction === 'sent' ? c.sentEmail : c.receivedEmail}: ${p.subject} (${p.occurred_on})${p.note ? ` — ${p.note}` : ''}`;
      case 'applied_via_approval': return c.viaApproval;
    }
  };
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  if (!data) return null;
  return <Card>
    <CardHeader><CardTitle>{c.title}</CardTitle></CardHeader>
    <CardContent className="grid min-w-0 gap-6">
      {error && <p role="alert" className="text-sm text-destructive">{c.error}</p>}
      <div className="grid gap-2">
        <Label htmlFor="application-stage">{c.stage}</Label>
        <select id="application-stage" className={selectClass} value={data.stage} disabled={busy}
          onChange={event => void run(() => sendJson(`${path}/application-status`, 'PATCH', { application_status: event.target.value }), onStageChanged)}>
          {STAGES.map(stage => <option key={stage} value={stage}>{stageLabel[stage][locale]}</option>)}
        </select>
      </div>

      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void run(() => sendJson(`${path}/application/contact`, 'PUT', { name: blank(contact.name), email: blank(contact.email), role: blank(contact.role) })); }}>
        <h3 className="text-sm font-semibold">{c.contact}</h3>
        <div className="grid gap-2"><Label htmlFor="contact-name">{c.name}</Label><Input id="contact-name" maxLength={200} value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} /></div>
        <div className="grid gap-2"><Label htmlFor="contact-email">{c.email}</Label><Input id="contact-email" type="email" maxLength={320} value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} /></div>
        <div className="grid gap-2"><Label htmlFor="contact-role">{c.role}</Label><Input id="contact-role" maxLength={200} value={contact.role} onChange={e => setContact({ ...contact, role: e.target.value })} /></div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" disabled={busy}>{c.saveContact}</Button>
          {data.contact.email && <Button asChild variant="ghost"><a href={mailtoHref(data.contact.email, jobTitle)}><Mail className="size-4" aria-hidden="true" />{c.write}</a></Button>}
        </div>
        {data.contact.email && <p className="text-xs text-muted-foreground">{c.writeHelp}</p>}
      </form>

      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); if (!log.subject.trim()) return; void run(() => sendJson(`${path}/application/events`, 'POST', { kind: 'email_logged', direction: log.direction, subject: log.subject.trim(), occurred_on: log.occurred_on, note: blank(log.note) }), () => setLog({ ...log, subject: '', note: '' })); }}>
        <h3 className="text-sm font-semibold">{c.log}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="log-direction">{c.direction}</Label><select id="log-direction" className={selectClass} value={log.direction} onChange={e => setLog({ ...log, direction: e.target.value })}><option value="sent">{c.sent}</option><option value="received">{c.received}</option></select></div>
          <div className="grid gap-2"><Label htmlFor="log-date">{c.date}</Label><Input id="log-date" type="date" required value={log.occurred_on} onChange={e => setLog({ ...log, occurred_on: e.target.value })} /></div>
        </div>
        <div className="grid gap-2"><Label htmlFor="log-subject">{c.subject}</Label><Input id="log-subject" required maxLength={300} value={log.subject} onChange={e => setLog({ ...log, subject: e.target.value })} /></div>
        <div className="grid gap-2"><Label htmlFor="log-note">{c.logNote}</Label><Textarea id="log-note" rows={2} maxLength={2000} value={log.note} onChange={e => setLog({ ...log, note: e.target.value })} /></div>
        <div><Button type="submit" variant="outline" disabled={busy || !log.subject.trim()}>{c.logAction}</Button></div>
      </form>

      <form className="grid gap-2" onSubmit={event => { event.preventDefault(); if (!note.trim()) return; void run(() => sendJson(`${path}/application/events`, 'POST', { kind: 'note', text: note.trim() }), () => setNote('')); }}>
        <Label htmlFor="application-note">{c.note}</Label>
        <Textarea id="application-note" rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} />
        <div><Button type="submit" variant="outline" disabled={busy || !note.trim()}>{c.addNote}</Button></div>
      </form>

      <div className="grid gap-2">
        <h3 id="application-timeline" className="text-sm font-semibold">{c.timeline}</h3>
        {data.events.length === 0 ? <p className="text-sm text-muted-foreground">{c.empty}</p> :
          <ol aria-labelledby="application-timeline" className="grid gap-3 border-s ps-4">{data.events.map(event => <li key={event.id} className="grid gap-0.5">
            <p className="break-words text-sm">{describe(event)}</p>
            <p className="text-xs text-muted-foreground">{c.actor[event.actor]} · {when.format(new Date(event.created_at))}</p>
          </li>)}</ol>}
      </div>
    </CardContent>
  </Card>;
}
