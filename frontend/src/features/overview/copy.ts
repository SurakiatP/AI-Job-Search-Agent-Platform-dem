import { useTranslation } from 'react-i18next';

const th = {
  subtitleFirst: 'เพิ่ม CV แล้วค้นหางานที่อยากประเมิน',
  gettingStarted: 'เริ่มต้นใช้งาน',
  nextStep: 'ขั้นถัดไป',
  stepDone: 'ทำแล้ว',
  steps: [
    { title: 'เพิ่ม CV ฉบับแรก', body: 'ไฟล์ PDF, DOCX หรือ TXT' },
    { title: 'หางาน', body: 'ค้นหาตำแหน่งหรือบันทึกประกาศงานที่มีอยู่' },
    { title: 'ประเมินความเหมาะสม', body: 'จับคู่งานที่บันทึกไว้กับ CV หนึ่งฉบับ' },
  ],
  cvDone: (name: string, version: number) => `${name} · ฉบับที่ ${version}`,
  jobDone: (title: string, more: number) => more > 0 ? `${title} และอีก ${more} งาน` : title,
  waitsFor: (cv: boolean, job: boolean): string => cv && job ? 'ต้องมี CV และงานที่บันทึกไว้ก่อน' : cv ? 'ต้องมี CV ก่อน' : 'ต้องมีงานที่บันทึกไว้ก่อน',
  helpTitle: 'ต้องการความช่วยเหลือไหม',
  tips: [
    { title: 'CV แต่ละฉบับเก็บไฟล์ต้นฉบับไว้', body: 'อัปโหลด CV หลายฉบับได้ ระบบเก็บต้นฉบับให้ครบ' },
    { title: 'ผลประเมินระบุ CV และงานที่ใช้เสมอ', body: 'ดูได้ชัดว่าแต่ละผลประเมินใช้ CV และงานฉบับไหน' },
    { title: 'หน้าใบสมัครติดตามความคืบหน้า', body: 'เก็บรายการงานที่สมัครแล้ว พร้อม CV ที่ใช้และบันทึกของคุณ' },
  ],
  dismissHelp: 'เข้าใจแล้ว ซ่อนไว้',
  evaluations: 'ผลการประเมิน',
  noEvaluations: 'ยังไม่มีผลการประเมิน',
  noEvaluationsFirst: 'เพิ่ม CV และหางานก่อน แล้วจะเริ่มประเมินครั้งแรกได้',
  noEvaluationsReturning: 'เริ่มจากงานที่บันทึกไว้ด้านล่าง',
  recentEvaluations: 'ผลประเมินล่าสุด',
  jobs: 'งานและใบสมัคร',
  noJobs: 'ยังไม่มีงานที่บันทึกไว้',
  noJobsFirst: 'ค้นหาตำแหน่งหรือบันทึกประกาศงานเพื่อเริ่มต้น',
  version: (n: number) => `ฉบับที่ ${n}`,
  usedCv: (name: string, version: number) => `${name} · ฉบับที่ ${version}`,
  running: 'กำลังทำงานอยู่',
};

const en: typeof th = {
  subtitleFirst: 'Add a CV, then find a role to evaluate.',
  gettingStarted: 'Getting started',
  nextStep: 'Next step',
  stepDone: 'Done',
  steps: [
    { title: 'Add your first CV', body: 'PDF, DOCX or TXT.' },
    { title: 'Find a job', body: 'Search roles or save a posting you already have.' },
    { title: 'Evaluate a match', body: 'Pair a saved job with a CV version.' },
  ],
  cvDone: (name, version) => `${name} · v${version}`,
  jobDone: (title, more) => more > 0 ? `${title} and ${more} more` : title,
  waitsFor: (cv, job) => cv && job ? 'Needs a CV and a saved job first.' : cv ? 'Needs a CV first.' : 'Needs a saved job first.',
  helpTitle: 'Need a hand?',
  tips: [
    { title: 'CV versions keep your original files.', body: 'Upload different versions of your CV and we keep the originals safe.' },
    { title: 'Evaluations always name their CV and job.', body: "It's clear which CV and job were used for each evaluation." },
    { title: 'Applications tracks your progress.', body: "Keep a list of the jobs you've applied to, with the CV version and notes." },
  ],
  dismissHelp: 'Got it, hide this',
  evaluations: 'Evaluations',
  noEvaluations: 'No evaluations yet',
  noEvaluationsFirst: 'Add a CV and find a job to create your first evaluation.',
  noEvaluationsReturning: 'Start one from a saved job below.',
  recentEvaluations: 'Recent evaluations',
  jobs: 'Jobs and applications',
  noJobs: 'No saved jobs yet',
  noJobsFirst: 'Search for roles or save a posting to get started.',
  version: n => `Version ${n}`,
  usedCv: (name, version) => `${name} · v${version}`,
  running: 'Running now',
};

export function useOverviewCopy() {
  return useTranslation().i18n.language.startsWith('th') ? th : en;
}
