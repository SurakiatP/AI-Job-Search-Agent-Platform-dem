import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { unsubscribeDigest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';

const copy = {
  th: { title: 'หยุดรับอีเมลสรุปงาน', intro: 'กดยืนยันเพื่อหยุดรับอีเมลสรุปของการค้นหานี้', confirm: 'หยุดรับสรุปนี้',
        done: 'คุณจะไม่ได้รับสรุปนี้อีก เปิดใหม่ได้ในแอป', expired: 'ลิงก์นี้หมดอายุแล้ว จัดการอีเมลสรุปได้ในแอป', error: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', login: 'เข้าสู่ระบบ' },
  en: { title: 'Stop email digest', intro: 'Confirm to stop the email digest for this saved search.', confirm: 'Stop this digest',
        done: 'You will no longer get this digest. You can turn it back on in the app.', expired: 'This link has expired. Manage digests in the app.', error: 'Something went wrong. Try again.', login: 'Log in' },
};

export function DigestUnsubscribePage() {
  const locale = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'expired' | 'error'>('idle');
  async function confirm() {
    if (!token) { setState('expired'); return; }
    setState('busy');
    try { await unsubscribeDigest(token); setState('done'); }
    catch (error) { setState(error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 422) ? 'expired' : 'error'); }
  }
  return <>
    <Header />
    <main id="main-content" tabIndex={-1} className="mx-auto grid w-full max-w-md px-4 py-12 sm:py-16">
      <Card>
        <CardHeader><h1 className="text-xl font-semibold leading-snug">{c.title}</h1></CardHeader>
        <CardContent className="grid gap-4">
          {state === 'done' ? <p role="status">{c.done}</p> : state === 'expired' ? <>
            <p role="alert">{c.expired}</p>
            <Button asChild variant="outline"><Link to="/login">{c.login}</Link></Button>
          </> : <>
            <p className="text-sm text-muted-foreground">{c.intro}</p>
            {state === 'error' && <p role="alert" className="text-sm text-destructive">{c.error}</p>}
            <Button onClick={() => void confirm()} disabled={state === 'busy'}>{c.confirm}</Button>
          </>}
        </CardContent>
      </Card>
    </main>
  </>;
}
