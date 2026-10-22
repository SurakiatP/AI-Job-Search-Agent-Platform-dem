import type { ApplicationStage } from './api-types';

export const ACTIVE_STAGES: ApplicationStage[] = ['saved', 'applied', 'responded', 'interview', 'offer', 'hired'];
export const CLOSED_STAGES: ApplicationStage[] = ['rejected', 'withdrawn'];
export const STAGES: ApplicationStage[] = [...ACTIVE_STAGES, ...CLOSED_STAGES];
export const APPLIED_ONWARD = new Set<ApplicationStage>(['applied', 'responded', 'interview', 'offer', 'hired']);

export const stageLabel: Record<ApplicationStage, { th: string; en: string }> = {
  saved: { th: 'บันทึกไว้', en: 'Saved' },
  applied: { th: 'สมัครแล้ว', en: 'Applied' },
  responded: { th: 'ได้รับการตอบกลับ', en: 'Responded' },
  interview: { th: 'สัมภาษณ์', en: 'Interview' },
  offer: { th: 'ได้รับข้อเสนอ', en: 'Offer' },
  hired: { th: 'ได้งานแล้ว', en: 'Hired' },
  rejected: { th: 'ถูกปฏิเสธ', en: 'Rejected' },
  withdrawn: { th: 'ถอนใบสมัคร', en: 'Withdrawn' },
};
