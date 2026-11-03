import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useDraft } from '../../app/drafts';
import { ErrorState, LoadingState } from '../projects/PageStates';
import { sendJson, useResource } from '../projects/useResource';

type Preferences = { project_id: string; output_language: 'th' | 'en'; notifications_enabled: boolean; submit_autopilot_daily_limit?: number | null };

const copy = {
  th: { docSettings: 'การตั้งค่าเอกสาร', autoLabel: 'อนุมัติการบันทึก “สมัครแล้ว” อัตโนมัติ: จำนวนสูงสุดต่อวัน (เว้นว่าง = ปิด)', autoHint: 'ระบบเพียงบันทึกว่า "สมัครแล้ว" ไม่ส่งใบสมัครให้ คุณยังต้องส่งเองบนเว็บไซต์ของบริษัท ใช้ได้เมื่อชุดคำตอบพร้อมและครบทุกข้อบังคับเท่านั้น เอเจนต์ที่คุณให้สิทธิ์เข้าถึงใบสมัครก็ใช้ฟังก์ชันนี้ได้ สูงสุด N ใบต่อวัน', autoInvalid: 'ใส่จำนวนเต็ม 1-20 หรือเว้นว่าง', notifyHint: 'แจ้งเตือนเมื่องานของเอเจนต์เสร็จหรือรออนุมัติ' },
  en: { docSettings: 'Document settings', autoLabel: 'Automatically approve recording “Applied”: daily limit (blank = off)', autoHint: 'This only records "applied"; nothing is ever sent. You still submit on the company site yourself. Applies only when the answer pack is ready with every required answer filled. Agents you have given application access can also use this, up to N per day.', autoInvalid: 'Enter a whole number from 1 to 20, or leave empty', notifyHint: 'Tell me when an agent task finishes or needs approval' },
};

// Document language, notifications and the auto-record limit for one project (moved here from the CV page, Q-03).
export function ProjectPreferences({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation();
  const c = copy[i18n.language.startsWith('th') ? 'th' : 'en'];
  const preferences = useResource<Preferences>(`/projects/${projectId}/preferences`);
  const [languageDraft, setLanguageDraft] = useDraft(projectId, 'profile', 'output-language');
  const [notificationsDraft, setNotificationsDraft] = useDraft(projectId, 'profile', 'notifications');
  const language: 'th' | 'en' = languageDraft === 'th' || languageDraft === 'en' ? languageDraft : preferences.data?.output_language ?? 'th';
  const notifications = notificationsDraft ? notificationsDraft === 'true' : preferences.data?.notifications_enabled ?? true;
  const [limitDraft, setLimitDraft] = useState<string | null>(null);
  const limit = limitDraft ?? (preferences.data?.submit_autopilot_daily_limit?.toString() ?? '');
  const limitValid = limit === '' || /^([1-9]|1\d|20)$/.test(limit);
  const [saveError, setSaveError] = useState(false);
  if (preferences.status === 'loading' && !preferences.data) return <LoadingState />;
  if (preferences.status === 'error') return <ErrorState onRetry={preferences.reload} />;

  async function savePreferences() {
    setSaveError(false);
    if (!limitValid) return;
    try { await sendJson(`/projects/${projectId}/preferences`, 'PATCH', { output_language: language, notifications_enabled: notifications, submit_autopilot_daily_limit: limit === '' ? null : Number(limit) }); setLanguageDraft(''); setNotificationsDraft(''); setLimitDraft(null); preferences.reload(); }
    catch { setSaveError(true); }
  }
  return <Card>
    <CardHeader><CardTitle className="text-lg">{c.docSettings}</CardTitle></CardHeader>
    <CardContent className="grid gap-4">
      <div className="grid gap-2"><label htmlFor="output-language" className="text-sm font-medium">{t('pages.outputLanguage', { defaultValue: 'Document language' })}</label>
        <Select id="output-language" value={language} onChange={event => setLanguageDraft(event.target.value)}><option value="th">ไทย</option><option value="en">English</option></Select></div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent">
        <input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" checked={notifications} onChange={event => setNotificationsDraft(String(event.target.checked))} />
        <span className="min-w-0"><span className="block text-sm font-medium">{t('pages.notifications', { defaultValue: 'Notifications' })}</span><span className="block text-sm text-muted-foreground">{c.notifyHint}</span></span>
      </label>
      <div className="grid gap-2"><label htmlFor="autopilot-limit" className="text-sm font-medium">{c.autoLabel}</label>
        <Input id="autopilot-limit" inputMode="numeric" maxLength={2} value={limit} aria-invalid={!limitValid} aria-describedby="autopilot-hint" onChange={event => setLimitDraft(event.target.value.trim())} />
        <p id="autopilot-hint" className={limitValid ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>{limitValid ? c.autoHint : c.autoInvalid}</p></div>
      {saveError && <Alert severity="error" role="alert">{t('pages.loadError', { defaultValue: 'We could not load this information.' })}</Alert>}
    </CardContent>
    <CardFooter className="justify-end gap-2"><Button onClick={() => void savePreferences()}>{t('pages.savePreferences', { defaultValue: 'Save preferences' })}</Button></CardFooter>
  </Card>;
}
