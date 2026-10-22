import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, MailMinus, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { unsubscribeDigest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';
import { AuthLayout } from '../auth/AuthPages';

// The unsubscribe call answers 204 without the search name, so the page speaks about "this digest".
const copy = {
  th: { title: 'หยุดรับอีเมลสรุปงานนี้ไหม', intro: 'หยุดอีเมลสรุปของการค้นหาที่บันทึกไว้ซึ่งผูกกับอีเมลฉบับนี้', scope: 'เฉพาะสรุปของการค้นหานี้เท่านั้นที่เปลี่ยน บัญชีและสรุปอื่นของคุณไม่ถูกแตะต้อง', noLogin: 'ไม่ต้องเข้าสู่ระบบเพื่อหยุดสรุปนี้', confirm: 'หยุดรับสรุปนี้',
        doneTitle: 'หยุดแล้ว', done: 'คุณจะไม่ได้รับสรุปนี้อีก เปิดใหม่ได้ในแอป', expiredTitle: 'ลิงก์ใช้ไม่ได้', expired: 'ลิงก์นี้หมดอายุแล้ว หรืออาจถูกใช้ไปแล้ว จัดการอีเมลสรุปได้ในแอป', error: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', manage: 'เข้าสู่ระบบเพื่อจัดการอีเมลสรุป' },
  en: { title: 'Stop this email digest?', intro: 'Stop updates for the saved search linked to this email.', scope: "Only this search's digest changes. Your account and other digests stay unchanged.", noLogin: 'No login is needed to stop this digest.', confirm: 'Stop this digest',
        doneTitle: 'Stopped', done: 'You will no longer get this digest. You can turn it back on in the app.', expiredTitle: 'This link did not work', expired: 'This link has expired. It may also have been used already. Manage digests in the app.', error: 'Something went wrong. Try again.', manage: 'Log in to manage digests' },
};

export function DigestUnsubscribePage() {
  const locale = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'expired' | 'error'>(token ? 'idle' : 'expired');
  async function confirm() {
    setState('busy');
    try { await unsubscribeDigest(token); setState('done'); }
    catch (error) { setState(error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 422) ? 'expired' : 'error'); }
  }
  const manage = <Button asChild variant="outline"><Link to="/login?next=%2Fapp%2Fprojects">{c.manage}</Link></Button>;
  if (state === 'done') return <AuthLayout title={c.doneTitle} icon={<CheckCircle2 className="size-8 text-success" aria-hidden="true" />}>
    <p role="status" className="text-sm text-muted-foreground">{c.done}</p>
    {manage}
  </AuthLayout>;
  if (state === 'expired') return <AuthLayout title={c.expiredTitle} icon={<TriangleAlert className="size-8 text-destructive" aria-hidden="true" />}>
    <p role="alert" className="text-sm text-destructive">{c.expired}</p>
    {manage}
  </AuthLayout>;
  return <AuthLayout title={c.title} intro={c.intro} icon={<MailMinus className="size-8 text-primary" aria-hidden="true" />}>
    <p className="text-sm text-muted-foreground">{c.scope}</p>
    {state === 'error' && <p role="alert" className="text-sm text-destructive">{c.error}</p>}
    <Button onClick={() => void confirm()} disabled={state === 'busy'}>{c.confirm}</Button>
    {manage}
    <p className="text-sm text-muted-foreground">{c.noLogin}</p>
  </AuthLayout>;
}
