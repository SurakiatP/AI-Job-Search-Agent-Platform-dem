import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ApplicationDetailView, ApplicationEventView, ApplicationStage } from '../../lib/api-types';
import { STAGES, stageLabel } from '../../lib/applicationStages';
import { selectClass } from '../settings/Field';
import { sendJson, useResource } from '../projects/useResource';

const today = () => new Date().toISOString().slice(0, 10);

export function mailtoHref(email: string, jobTitle: string): string {
  const [local, domain] = email.split('@');
  return `mailto:${encodeURIComponent(local)}@${encodeURIComponent(domain)}?subject=${encodeURIComponent(`Re: ${jobTitle}`)}`;
}

export function ApplicationPanel({ projectId, jobId, jobTitle, onStageChanged, className }: { projectId: string; jobId: string; jobTitle: string; onStageChanged: () => void; className?: string }) {
  const { t, i18n } = useTranslation('applicationsWorkspace');
  const locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const path = `/projects/${projectId}/jobs/${jobId}`;
  const result = useResource<ApplicationDetailView>(`${path}/application`);
  const [contact, setContact] = useState({ name: '', email: '', role: '' });
  const [log, setLog] = useState({ direction: 'sent', subject: '', occurred_on: today(), note: '' });
  const [note, setNote] = useState('');
  const [composer, setComposer] = useState<'note' | 'email' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const data = result.data;

  useEffect(() => {
    if (data) setContact({ name: data.contact.name ?? '', email: data.contact.email ?? '', role: data.contact.role ?? '' });
  }, [data?.contact.name, data?.contact.email, data?.contact.role]);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (busy) return;
    setBusy(true); setError(false);
    try { await action(); after?.(); result.reload(); } catch { setError(true); } finally { setBusy(false); }
  }
  const blank = (value: string) => value.trim() || null;
  const describe = (event: ApplicationEventView): string => {
    const p = event.payload as Record<string, string | null>;
    switch (event.kind) {
      case 'stage_changed': return `${stageLabel[p.from as ApplicationStage]?.[locale] ?? String(p.from)} → ${stageLabel[p.to as ApplicationStage]?.[locale] ?? String(p.to)}`;
      case 'note': return p.text ?? '';
      case 'contact_updated': return [t('contactUpdated'), p.name, p.email].filter(Boolean).join(' · ');
      case 'email_logged': return `${t(p.direction === 'sent' ? 'sentEmail' : 'receivedEmail')}: ${p.subject} (${p.occurred_on})${p.note ? ` — ${p.note}` : ''}`;
      case 'applied_via_approval': return t('appliedViaApproval');
    }
  };
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  if (!data) return result.status === 'error' ? <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{t('loadDetailError')}<Button variant="outline" size="sm" onClick={result.reload}>{t('retry')}</Button></p> : null;
  return <section aria-labelledby="application-tracking-title" aria-busy={busy} className={cn('grid min-w-0 content-start gap-6', className)}>
    <div className="grid gap-1"><h2 id="application-tracking-title" className="text-lg font-semibold">{t('applicationTracking')}</h2><p className="text-sm text-muted-foreground">{t('recordingNote')}</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{t('saveError')}</p>}

    <div className="grid gap-2">
      <Label htmlFor="application-stage">{t('stage')}</Label>
      <select id="application-stage" className={selectClass} value={data.stage} disabled={busy}
        onChange={event => void run(() => sendJson(`${path}/application-status`, 'PATCH', { application_status: event.target.value }), onStageChanged)}>
        {STAGES.map(stage => <option key={stage} value={stage}>{stageLabel[stage][locale]}</option>)}
      </select>
    </div>

    <form className="grid gap-3 border-t border-border pt-5" onSubmit={event => { event.preventDefault(); void run(() => sendJson(`${path}/application/contact`, 'PUT', { name: blank(contact.name), email: blank(contact.email), role: blank(contact.role) })); }}>
      <h3 className="text-sm font-semibold">{t('contact')}</h3>
      <div className="grid gap-2"><Label htmlFor="contact-name">{t('name')}</Label><Input id="contact-name" maxLength={200} value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} /></div>
      <div className="grid gap-2"><Label htmlFor="contact-email">{t('email')}</Label><Input id="contact-email" type="email" maxLength={320} value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} /></div>
      <div className="grid gap-2"><Label htmlFor="contact-role">{t('role')}</Label><Input id="contact-role" maxLength={200} value={contact.role} onChange={e => setContact({ ...contact, role: e.target.value })} /></div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" busy={busy} disabled={busy}>{t('saveContact')}</Button>
        {data.contact.email && <Button asChild variant="ghost"><a href={mailtoHref(data.contact.email, jobTitle)}><Mail className="size-4" aria-hidden="true" />{t('writeEmail')}</a></Button>}
      </div>
      {data.contact.email && <p className="text-xs text-muted-foreground">{t('writeEmailHelp')}</p>}
    </form>

    <div className="grid gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="application-timeline" className="text-sm font-semibold">{t('timeline')}</h3>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" aria-expanded={composer === 'note'} aria-controls="application-composer" onClick={() => setComposer(composer === 'note' ? null : 'note')}><NotebookPen className="size-4" aria-hidden="true" />{t('addNote')}</Button>
          <Button type="button" variant="outline" size="sm" aria-expanded={composer === 'email'} aria-controls="application-composer" onClick={() => setComposer(composer === 'email' ? null : 'email')}><Mail className="size-4" aria-hidden="true" />{t('logEmail')}</Button>
        </div>
      </div>
      <div id="application-composer">
        {composer === 'note' && <form className="grid gap-2" onSubmit={event => { event.preventDefault(); if (!note.trim()) return; void run(() => sendJson(`${path}/application/events`, 'POST', { kind: 'note', text: note.trim() }), () => { setNote(''); setComposer(null); }); }}>
          <Label htmlFor="application-note">{t('note')}</Label>
          <Textarea id="application-note" rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} />
          <div><Button type="submit" busy={busy} disabled={busy || !note.trim()}>{t('saveNote')}</Button></div>
        </form>}
        {composer === 'email' && <form className="grid gap-3" onSubmit={event => { event.preventDefault(); if (!log.subject.trim()) return; void run(() => sendJson(`${path}/application/events`, 'POST', { kind: 'email_logged', direction: log.direction, subject: log.subject.trim(), occurred_on: log.occurred_on, note: blank(log.note) }), () => { setLog({ ...log, subject: '', note: '' }); setComposer(null); }); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="log-direction">{t('direction')}</Label><select id="log-direction" className={selectClass} value={log.direction} onChange={e => setLog({ ...log, direction: e.target.value })}><option value="sent">{t('sent')}</option><option value="received">{t('received')}</option></select></div>
            <div className="grid gap-2"><Label htmlFor="log-date">{t('date')}</Label><Input id="log-date" type="date" required value={log.occurred_on} onChange={e => setLog({ ...log, occurred_on: e.target.value })} /></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="log-subject">{t('subject')}</Label><Input id="log-subject" maxLength={300} value={log.subject} onChange={e => setLog({ ...log, subject: e.target.value })} /></div>
          <div className="grid gap-2"><Label htmlFor="log-note">{t('detailsOptional')}</Label><Textarea id="log-note" rows={2} maxLength={2000} value={log.note} onChange={e => setLog({ ...log, note: e.target.value })} /></div>
          <div><Button type="submit" busy={busy} disabled={busy || !log.subject.trim()}>{t('saveEmail')}</Button></div>
        </form>}
      </div>
      {data.events.length === 0 ? <p className="text-sm text-muted-foreground">{t('emptyHistory')}</p> :
        <ol aria-labelledby="application-timeline" className="grid gap-3 border-s ps-4">{data.events.map(event => <li key={event.id} className="grid gap-0.5">
          <p className="break-words text-sm">{describe(event)}</p>
          <p className="text-xs text-muted-foreground">{t(event.actor === 'user' ? 'you' : event.actor)} · {when.format(new Date(event.created_at))}</p>
        </li>)}</ol>}
    </div>
  </section>;
}
