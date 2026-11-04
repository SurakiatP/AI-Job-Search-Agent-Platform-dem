import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Mail, NotebookPen, Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ApplicationDetailView, ApplicationEventView, ApplicationStage } from '../../lib/api-types';
import { STAGES, stageLabel } from '../../lib/applicationStages';
import { sendJson, useResource } from '../projects/useResource';
import { dateLocale } from '../../lib/locale';

const today = () => new Date().toLocaleDateString('sv-SE');

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
  const [contactSaved, setContactSaved] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const data = result.data;
  const hasContact = Boolean(data && (data.contact.name || data.contact.email || data.contact.role));

  useEffect(() => {
    if (data) setContact({ name: data.contact.name ?? '', email: data.contact.email ?? '', role: data.contact.role ?? '' });
  }, [data?.contact.name, data?.contact.email, data?.contact.role]);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (busy) return;
    setBusy(true); setError(false); setContactSaved(false);
    try { await action(); after?.(); result.reload(); } catch { setError(true); } finally { setBusy(false); }
  }
  const blank = (value: string) => value.trim() || null;
  const describe = (event: ApplicationEventView): string => {
    const p = event.payload as Record<string, string | null>;
    switch (event.kind) {
      case 'stage_changed': return `${stageLabel[p.from as ApplicationStage]?.[locale] ?? String(p.from)} → ${stageLabel[p.to as ApplicationStage]?.[locale] ?? String(p.to)}`;
      case 'note': return p.text ?? '';
      case 'contact_updated': return [t('contactUpdated'), p.name, p.email].filter(Boolean).join(' · ');
      case 'email_logged': {
        const day = new Date(`${p.occurred_on}T00:00:00`);
        return `${t(p.direction === 'sent' ? 'sentEmail' : 'receivedEmail')}: ${p.subject} (${Number.isNaN(day.getTime()) ? p.occurred_on : day.toLocaleDateString(dateLocale(locale), { dateStyle: 'medium' })})${p.note ? ` — ${p.note}` : ''}`;
      }
      case 'applied_via_approval': return t('appliedViaApproval');
      default: return '';
    }
  };
  const when = new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: 'medium', timeStyle: 'short' });

  if (!data) return result.status === 'error' ? <Alert severity="error" action={<Button variant="outline" size="sm" onClick={result.reload}>{t('retry')}</Button>}>{t('loadDetailError')}</Alert> : null;
  return <section aria-labelledby="application-tracking-title" aria-busy={busy} className={cn('grid min-w-0 content-start gap-6 rounded-lg border border-border bg-card p-5 sm:p-6', className)}>
    <div className="grid gap-1"><h2 id="application-tracking-title" className="text-lg font-semibold">{t('applicationTracking')}</h2><p className="text-sm text-muted-foreground">{t('recordingNote')}</p></div>
    {error && <Alert severity="error">{t('saveError')}</Alert>}

    <div className="mui-field mui-select">
      <Select id="application-stage" value={data.stage} disabled={busy}
        onChange={event => void run(() => sendJson(`${path}/application-status`, 'PATCH', { application_status: event.target.value }), onStageChanged)}>
        {STAGES.map(stage => <option key={stage} value={stage}>{stageLabel[stage][locale]}</option>)}
      </Select>
      <Label htmlFor="application-stage" className="mui-label">{t('stage')}</Label>
    </div>
    {/* CH-05: contact and activity stay one click away so the job page keeps one clear next action above the fold. */}
    <details className="group/track border-t border-border pt-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-10 [&::-webkit-details-marker]:hidden"><span>{t('trackingDetails', { count: data.events.length })}</span><ChevronDown className="size-4 transition-transform group-open/track:rotate-180" aria-hidden="true" /></summary>
      <div className="mt-4 grid gap-6">

    {!contactOpen && !hasContact
      ? <div className="border-t border-border pt-5"><Button type="button" variant="ghost" size="sm" aria-expanded="false" onClick={() => setContactOpen(true)}>{t('addContact')}</Button></div>
      : !contactOpen ? <div className="grid gap-2 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t('contact')}</h3>
          <Button type="button" variant="ghost" size="sm" aria-expanded="false" onClick={() => setContactOpen(true)}>{t('editContact')}</Button>
        </div>
        <p className="min-w-0 break-words text-sm">{[data.contact.name, data.contact.role].filter(Boolean).join(' · ')}</p>
        {data.contact.email && <p className="min-w-0 break-all text-sm text-muted-foreground">{data.contact.email}</p>}
        <span role="status" className="text-sm text-success">{contactSaved ? t('contactSaved') : ''}</span>
      </div>
      : <form className="grid gap-3 border-t border-border pt-5" onSubmit={event => { event.preventDefault(); void run(() => sendJson(`${path}/application/contact`, 'PUT', { name: blank(contact.name), email: blank(contact.email), role: blank(contact.role) }), () => { setContactSaved(true); setContactOpen(false); }); }}>
      <h3 className="text-sm font-semibold">{t('contact')}</h3>
      <div className="grid gap-2"><div className="mui-field"><Input placeholder=" " id="contact-name" maxLength={200} value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} /><Label htmlFor="contact-name" className="mui-label">{t('name')}</Label></div></div>
      <div className="grid gap-2"><div className="mui-field"><Input placeholder=" " id="contact-email" type="email" maxLength={320} value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} /><Label htmlFor="contact-email" className="mui-label">{t('email')}</Label></div></div>
      <div className="grid gap-2"><div className="mui-field"><Input placeholder=" " id="contact-role" maxLength={200} value={contact.role} onChange={e => setContact({ ...contact, role: e.target.value })} /><Label htmlFor="contact-role" className="mui-label">{t('role')}</Label></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" busy={busy} disabled={busy}>{t('saveContact')}</Button>
        <span role="status" className="text-sm text-success">{contactSaved ? t('contactSaved') : ''}</span>
        {data.contact.email && <Button asChild variant="ghost"><a href={mailtoHref(data.contact.email, jobTitle)}><Mail className="size-4" aria-hidden="true" />{t('writeEmail')}</a></Button>}
      </div>
      {data.contact.email && <p className="text-sm text-muted-foreground">{t('writeEmailHelp')}</p>}
    </form>}

    <div className="grid gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="application-timeline" className="text-sm font-semibold">{t('timeline')}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm" aria-controls="application-composer"><Plus className="size-4" aria-hidden="true" />{t('addToHistory')}<ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setComposer('note')}><NotebookPen aria-hidden="true" />{t('addNote')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setComposer('email')}><Mail aria-hidden="true" />{t('logEmail')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div id="application-composer">
        {composer === 'note' && <form className="grid gap-2" onSubmit={event => { event.preventDefault(); if (!note.trim()) return; void run(() => sendJson(`${path}/application/events`, 'POST', { kind: 'note', text: note.trim() }), () => { setNote(''); setComposer(null); }); }}>
          <div className="mui-field"><Textarea placeholder=" " id="application-note" rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /><Label htmlFor="application-note" className="mui-label">{t('note')}</Label></div>
          <div><Button type="submit" busy={busy} disabled={busy || !note.trim()}>{t('saveNote')}</Button></div>
        </form>}
        {composer === 'email' && <form className="grid gap-3" onSubmit={event => { event.preventDefault(); if (!log.subject.trim()) return; void run(() => sendJson(`${path}/application/events`, 'POST', { kind: 'email_logged', direction: log.direction, subject: log.subject.trim(), occurred_on: log.occurred_on, note: blank(log.note) }), () => { setLog({ ...log, subject: '', note: '' }); setComposer(null); }); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="log-direction">{t('direction')}</Label><Select id="log-direction" value={log.direction} onChange={e => setLog({ ...log, direction: e.target.value })}><option value="sent">{t('sent')}</option><option value="received">{t('received')}</option></Select></div>
            <div className="grid gap-2"><div className="mui-field"><Input placeholder=" " id="log-date" type="date" required value={log.occurred_on} onChange={e => setLog({ ...log, occurred_on: e.target.value })} /><Label htmlFor="log-date" className="mui-label">{t('date')}</Label></div></div>
          </div>
          <div className="grid gap-2"><div className="mui-field"><Input placeholder=" " id="log-subject" maxLength={300} value={log.subject} onChange={e => setLog({ ...log, subject: e.target.value })} /><Label htmlFor="log-subject" className="mui-label">{t('subject')}</Label></div></div>
          <div className="grid gap-2"><div className="mui-field"><Textarea placeholder=" " id="log-note" rows={2} maxLength={2000} value={log.note} onChange={e => setLog({ ...log, note: e.target.value })} /><Label htmlFor="log-note" className="mui-label">{t('detailsOptional')}</Label></div></div>
          <div><Button type="submit" busy={busy} disabled={busy || !log.subject.trim()}>{t('saveEmail')}</Button></div>
        </form>}
      </div>
      {data.events.length === 0 ? <p className="text-sm text-muted-foreground">{t('emptyHistory')}</p> :
        <ol aria-labelledby="application-timeline" className="grid gap-3 border-s ps-4">{data.events.map(event => <li key={event.id} className="grid gap-0.5">
          <p className="break-words text-sm">{describe(event)}</p>
          <p className="text-xs text-muted-foreground">{t(event.actor === 'user' ? 'you' : event.actor)} · {when.format(new Date(event.created_at))}</p>
        </li>)}</ol>}
    </div>
    </div></details>
  </section>;
}
