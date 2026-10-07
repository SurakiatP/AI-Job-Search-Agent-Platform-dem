export const landingCopy = {
  th: {
    headline: 'สมัครงานให้ตรงจุด ด้วย AI ที่ทำงานบนเครื่องคุณ',
    sub: 'ใส่ CV กับประกาศงาน แล้วรับผลประเมินความเหมาะสมและเอกสารสมัครงานที่ปรับให้ตรงตำแหน่ง — คุณตรวจและส่งเองทุกครั้ง',
    cta: 'เริ่มใช้งาน',
    secondary: 'ดูวิธีทำงาน',
    howTitle: 'วิธีทำงาน',
    tabs: { evaluate: 'ประเมินงาน', documents: 'เอกสาร', search: 'ค้นหางาน' },
    sample: 'ตัวอย่าง',
    steps: [
      { title: 'ใส่ CV', body: 'เก็บ CV ต้นฉบับแยกจากเอกสารที่สร้างใหม่ทุกฉบับ' },
      { title: 'ประเมินความเหมาะสม', body: 'AI อ่านประกาศงานเทียบกับ CV แล้วให้คะแนนพร้อมเหตุผล' },
      { title: 'รับเอกสารที่ปรับแล้ว', body: 'ร่าง CV และ Cover letter ตามตำแหน่ง ให้คุณตรวจก่อนใช้' },
    ],
    privacyTitle: 'ข้อมูลของคุณอยู่กับคุณ',
    privacy: ['รันบนเครื่องของคุณ', 'คีย์ AI เก็บใน Keychain ของ macOS', 'ไม่ส่งใบสมัครแทนคุณ'],
    privacyNote: 'ข้อมูล CV ที่จำเป็นจะถูกส่งไปยังผู้ให้บริการ AI ที่คุณเลือก',
    closing: 'พร้อมเริ่มสมัครงานแบบตรงจุดหรือยัง',
  },
  en: {
    headline: 'Apply with precision, with an AI that runs on your machine',
    sub: 'Add your CV and a job posting, get a fit evaluation and tailored application documents — you review and submit every time.',
    cta: 'Get started',
    secondary: 'See how it works',
    howTitle: 'How it works',
    tabs: { evaluate: 'Evaluate', documents: 'Documents', search: 'Job search' },
    sample: 'Sample',
    steps: [
      { title: 'Add your CV', body: 'Keep the original CV separate from every generated document.' },
      { title: 'Evaluate the fit', body: 'The AI reads the job posting against your CV and scores it with reasons.' },
      { title: 'Get tailored documents', body: 'Draft a CV and cover letter for the role, for you to review before use.' },
    ],
    privacyTitle: 'Your data stays with you',
    privacy: ['Runs on your machine', 'AI keys live in macOS Keychain', 'Never submits applications for you'],
    privacyNote: 'CV content needed for a request goes to the AI provider you choose.',
    closing: 'Ready to apply with precision?',
  },
};

export const previewCopy: Record<'th' | 'en', {
  job: string; reasons: string[]; docs: { name: string; rev: string }[]; download: string;
  jobs: { title: string; place: string; salary: string; score: number }[];
}> = {
  th: {
    job: 'Frontend Developer · บริษัทตัวอย่าง จำกัด',
    reasons: ['ทักษะ React และ TypeScript ตรงกับประกาศ', 'ประสบการณ์ 3 ปีตามที่ต้องการ', 'ยังไม่มีประสบการณ์ด้านทดสอบอัตโนมัติ'],
    docs: [{ name: 'CV ฉบับปรับสำหรับตำแหน่ง', rev: 'ฉบับที่ 2' }, { name: 'Cover letter', rev: 'ฉบับที่ 1' }],
    download: 'ดาวน์โหลด',
    jobs: [
      { title: 'Frontend Developer', place: 'กรุงเทพฯ · ไฮบริด', salary: '60,000–80,000 บาท', score: 4.2 },
      { title: 'Full-stack Engineer', place: 'เชียงใหม่ · ทำงานระยะไกล', salary: '70,000–95,000 บาท', score: 3.4 },
      { title: 'Data Analyst', place: 'กรุงเทพฯ · ที่ออฟฟิศ', salary: '45,000–60,000 บาท', score: 2.1 },
    ],
  },
  en: {
    job: 'Frontend Developer · Sample Company Ltd.',
    reasons: ['React and TypeScript skills match the posting', '3 years of experience as requested', 'No automated-testing experience yet'],
    docs: [{ name: 'CV tailored for the role', rev: 'Revision 2' }, { name: 'Cover letter', rev: 'Revision 1' }],
    download: 'Download',
    jobs: [
      { title: 'Frontend Developer', place: 'Bangkok · Hybrid', salary: 'THB 60,000–80,000', score: 4.2 },
      { title: 'Full-stack Engineer', place: 'Chiang Mai · Remote', salary: 'THB 70,000–95,000', score: 3.4 },
      { title: 'Data Analyst', place: 'Bangkok · On-site', salary: 'THB 45,000–60,000', score: 2.1 },
    ],
  },
};

