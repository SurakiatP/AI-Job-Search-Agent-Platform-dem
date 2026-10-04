import { useState } from 'react';
import type { ApprovalView, Locale } from '../../lib/api-types';
import { Button } from '../../components/Button';

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
  const target = approval.revision_id ?? approval.target_file_id ?? '—';
  const action = ({ promote_cv: locale === 'th' ? 'ใช้เอกสารเป็น CV' : 'Promote document to CV', delete_document_revision: locale === 'th' ? 'ลบเอกสารฉบับนี้' : 'Delete this document revision', delete_file: locale === 'th' ? 'ลบไฟล์นี้' : 'Delete this file' })[approval.action];
  const t = locale === 'th'
    ? { heading: 'โปรดยืนยันการเปลี่ยนแปลง', target: 'เป้าหมายและฉบับ', digest: 'ลายนิ้วมือการเปลี่ยนแปลง', expires: 'หมดอายุ', approve: 'อนุมัติ', reject: 'ปฏิเสธ', confirm: 'ฉันตรวจสอบเป้าหมายและการเปลี่ยนแปลงแล้ว', expired: 'คำขอนี้หมดอายุแล้ว', refresh: 'โหลดสถานะใหม่' }
    : { heading: 'Review the requested change', target: 'Target and revision', digest: 'Change digest', expires: 'Expires', approve: 'Approve', reject: 'Reject', confirm: 'I reviewed the target and proposed change', expired: 'This request has expired', refresh: 'Refresh status' };
  return <section className="surface-card" aria-labelledby="approval-heading">
    <h2 id="approval-heading">{t.heading}</h2>
    <p>{action}</p>
    <dl>
      <dt>{t.target}</dt><dd>{target}</dd>
      {approval.expected_cv_revision_id && <><dt>CV revision</dt><dd>{approval.expected_cv_revision_id}</dd></>}
      <dt>{t.digest}</dt><dd>{approval.change_digest}</dd>
      <dt>{t.expires}</dt><dd><time dateTime={approval.expires_at}>{new Date(approval.expires_at).toLocaleString(locale)}</time></dd>
    </dl>
    {expired ? <><p role="status">{t.expired}</p><Button onClick={onRefresh}>{t.refresh}</Button></> : <>
      <label><input type="checkbox" checked={confirmation} onChange={event => setConfirmedIdentity(event.target.checked ? identity : '')} /> {t.confirm}</label>
      <div>
        <Button variant="primary" disabled={busy || !confirmation} onClick={() => onDecision(approval.id, 'approve')}>{t.approve}</Button>
        <Button disabled={busy} onClick={() => onDecision(approval.id, 'reject')}>{t.reject}</Button>
      </div>
    </>}
  </section>;
}

