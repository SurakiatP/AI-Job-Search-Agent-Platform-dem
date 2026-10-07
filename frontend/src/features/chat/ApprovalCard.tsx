import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { ApprovalView, Locale } from '../../lib/api-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ApprovalCard({ approval, locale, busy, onDecision, onRefresh }: {
  approval: ApprovalView | null;
  locale: Locale;
  busy: boolean;
  onDecision: (id: string, decision: 'approve' | 'reject') => void;
  onRefresh: () => void;
}) {
  const identity = approval ? `${approval.id}:${approval.change_digest}:${approval.revision_id}:${approval.target_file_id}` : '';
  const [confirmedIdentity, setConfirmedIdentity] = useState('');
  const confirmation = identity !== '' && confirmedIdentity === identity;
  if (!approval) return null;
  const expired = Date.parse(approval.expires_at) <= Date.now();
  const target = approval.revision_id ? (locale === 'th' ? 'ฉบับเอกสาร' : 'Document revision') : approval.target_file_id ? (locale === 'th' ? 'ไฟล์' : 'File') : '—';
  const action = ({ promote_cv: locale === 'th' ? 'ใช้เอกสารเป็น CV' : 'Promote document to CV', delete_document_revision: locale === 'th' ? 'ลบเอกสารฉบับนี้' : 'Delete this document revision', delete_file: locale === 'th' ? 'ลบไฟล์นี้' : 'Delete this file' })[approval.action];
  const t = locale === 'th'
    ? { heading: 'โปรดยืนยันการเปลี่ยนแปลง', target: 'เป้าหมาย', expires: 'หมดอายุ', approve: 'อนุมัติ', reject: 'ปฏิเสธ', confirm: 'ฉันตรวจสอบเป้าหมายและการเปลี่ยนแปลงแล้ว', expired: 'คำขอนี้หมดอายุแล้ว', refresh: 'โหลดสถานะใหม่' }
    : { heading: 'Review the requested change', target: 'Target', expires: 'Expires', approve: 'Approve', reject: 'Reject', confirm: 'I reviewed the target and proposed change', expired: 'This request has expired', refresh: 'Refresh status' };
  return <Card role="region" aria-labelledby="approval-heading" className="border-warning">
    <CardHeader className="flex-row items-start gap-3 pb-3">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0"><CardTitle id="approval-heading" className="text-lg">{t.heading}</CardTitle><p className="mt-1 break-words text-sm">{action}</p></div>
    </CardHeader>
    <CardContent className="grid gap-4">
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-muted-foreground">{t.target}</dt><dd>{target}</dd>
        <dt className="text-muted-foreground">{t.expires}</dt><dd><time dateTime={approval.expires_at}>{new Date(approval.expires_at).toLocaleString(locale)}</time></dd>
      </dl>
      {expired ? <div className="grid justify-items-start gap-3"><p role="status" className="text-sm">{t.expired}</p><Button type="button" variant="outline" onClick={onRefresh}>{t.refresh}</Button></div> : <>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={confirmation} onChange={event => setConfirmedIdentity(event.target.checked ? identity : '')} /> <span className="min-w-0 break-words">{t.confirm}</span></label>
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={busy || !confirmation} onClick={() => onDecision(approval.id, 'approve')}>{t.approve}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onDecision(approval.id, 'reject')}>{t.reject}</Button>
        </div>
      </>}
    </CardContent>
  </Card>;
}
