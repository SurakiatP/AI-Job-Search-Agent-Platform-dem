import { useTranslation } from 'react-i18next';
import type { NextStepKey } from './nextStep';

type Hero = { title: string; body: (job?: string) => string };

const th = {
  subtitleFirst: 'เริ่มจาก CV แล้วค้นหางานที่อยากประเมิน',
  nextStep: 'ขั้นถัดไป',
  hero: {
    uploadCv: { title: 'อัปโหลด CV', body: () => 'เพิ่มไฟล์ PDF, DOCX หรือ TXT ระบบจะอ่านให้ แล้วคุณตรวจได้ว่าอ่านถูกไหม' },
    readingCv: { title: 'กำลังอ่าน CV ของคุณ', body: () => 'ใช้เวลาไม่นาน ปิดหน้านี้ไว้ก่อนได้' },
    findJob: { title: 'หางานแรก', body: () => 'CV พร้อมแล้ว ค้นหาตำแหน่ง หรือบันทึกประกาศงานที่มีอยู่' },
    getFitScore: { title: 'ดูคะแนนความเหมาะสม', body: job => `เทียบ ${job} กับ CV ของคุณ` },
    draftLetter: { title: 'ร่างจดหมายสมัครงาน', body: job => `สำหรับ ${job}` },
    markApplied: { title: 'ฉันสมัครแล้ว', body: job => `บันทึกว่าคุณสมัคร ${job} แล้ว ระบบไม่ได้ส่งใบสมัครให้` },
    practise: { title: 'ซ้อมสัมภาษณ์งานนี้', body: job => `สำหรับ ${job}` },
    answerAi: { title: 'ตอบคำถามของ AI', body: () => 'มีงานที่หยุดรอคำตอบหรือการอนุมัติจากคุณ' },
  } satisfies Record<NextStepKey, Hero>,
  recentJobs: 'งานล่าสุด',
  noJobs: 'ยังไม่มีงานที่บันทึกไว้',
  noJobsFirst: 'ค้นหาตำแหน่งหรือบันทึกประกาศงานเพื่อเริ่มต้น',
  running: 'กำลังทำงานอยู่',
  failed: 'บันทึกสถานะไม่สำเร็จ ลองอีกครั้ง',
  ops: { extract_experience: 'อ่าน CV' } as Record<string, string>,
  usedCv: (name: string, version: number) => `CV: ${name} · ฉบับที่ ${version}`,
};

const en: typeof th = {
  subtitleFirst: 'Start with your CV, then find a job to score.',
  nextStep: 'Next step',
  hero: {
    uploadCv: { title: 'Upload your CV', body: () => 'Add a PDF, DOCX or TXT. The AI reads it, and you check what it understood.' },
    readingCv: { title: 'Reading your CV', body: () => 'This takes a moment. You can leave this page.' },
    findJob: { title: 'Find a job to score', body: () => 'Your CV is ready. Search roles or save a posting you already have.' },
    getFitScore: { title: 'Get a fit score', body: job => `Compare ${job} with your CV.` },
    draftLetter: { title: 'Draft a cover letter', body: job => `For ${job}.` },
    markApplied: { title: 'I applied', body: job => `Record that you applied to ${job}. Nothing is sent for you.` },
    practise: { title: 'Practise this interview', body: job => `For ${job}.` },
    answerAi: { title: "Answer the AI's question", body: () => 'A task is paused until you reply or approve.' },
  },
  recentJobs: 'Recent jobs',
  noJobs: 'No saved jobs yet',
  noJobsFirst: 'Search for roles or save a posting to get started.',
  running: 'Running now',
  failed: 'Could not record this. Try again.',
  ops: { extract_experience: 'Read CV' },
  usedCv: (name, version) => `CV: ${name} · v${version}`,
};

export function useOverviewCopy() { return useTranslation().i18n.language.startsWith('th') ? th : en; }
