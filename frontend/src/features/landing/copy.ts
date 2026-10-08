const th = {
  headlineA: 'สมัครงานให้ตรงจุด',
  headlineB: 'ด้วย AI ที่ทำงานบนเครื่องคุณ',
  sub: 'ใส่ CV กับประกาศงาน แล้วรับผลประเมินความเหมาะสมและเอกสารสมัครงานที่ปรับให้ตรงตำแหน่ง — คุณตรวจและส่งเองทุกครั้ง',
  cta: 'เริ่มใช้งาน',
  secondary: 'ดูวิธีทำงาน',
  caption: 'ภาพประกอบจากหน้าจอจริงของแอป · ข้อมูลตัวอย่าง',
  cards: { fit: 'ความเหมาะสม', skills: 'ทักษะตรง', tasks: 'งานของเอเจนต์', stale: 'ประกาศเก่า · 23 วัน' },
  statement: {
    muted: 'เว็บหางานทั่วไปให้รายการงานมาให้คุณไล่อ่านเอง',
    accent: 'แอปนี้ประเมินทุกงานเทียบกับ CV ของคุณ พร้อมเหตุผลที่ตรวจสอบได้',
  },
  tourTitle: 'วิธีทำงาน',
  tourLabel: 'ขั้นตอนการใช้งาน',
  steps: [
    { tab: 'ใส่ CV', eyebrow: 'ใส่ CV ครั้งเดียว', title: 'แนบ CV ครั้งเดียว ใช้ได้กับทุกงาน', body: 'อัปโหลด CV แล้วแอปอ่านทักษะและประสบการณ์ให้ CV ต้นฉบับของคุณจะไม่ถูกแก้ไข' },
    { tab: 'ค้นหางาน', eyebrow: 'ค้นหางานจริงในไทย', title: 'ค้นประกาศงานจริงในไทย', body: 'ค้นจากแคตตาล็อกงานโอเพนซอร์ส ดูอายุประกาศ รับคำเตือนเมื่อเป็นประกาศเก่าที่อาจปิดรับแล้ว และเปิดประกาศต้นฉบับได้ ออกจากเครื่องเฉพาะคำค้นหา' },
    { tab: 'ประเมิน', eyebrow: 'ประเมินด้วย AI + ทักษะ', title: 'คะแนนที่มีเหตุผลให้ตรวจ', body: 'AI อ่านประกาศเทียบกับ CV แล้วให้คะแนนพร้อมเหตุผล ส่วนทักษะที่ตรงคำนวณจากคำสำคัญโดยไม่ใช้ AI และแยกจากคะแนนอย่างชัดเจน' },
    { tab: 'ร่างเอกสาร', eyebrow: 'ร่างเอกสารที่ปรับแล้ว', title: 'ร่าง CV และ Cover letter ตามตำแหน่ง', body: 'ได้ฉบับร่างที่ปรับตามประกาศ แยกเวอร์ชัน ให้คุณตรวจก่อนใช้ และไม่ส่งใบสมัครแทนคุณ' },
    { tab: 'เชื่อม agent', eyebrow: 'เชื่อม AI agent ของคุณ', title: 'ต่อกับ agent ที่คุณใช้อยู่', body: 'เปิดให้ agent ภายนอกเรียกผ่าน REST, MCP หรือ A2A งานทุกชิ้นแสดงใน Agent Console และงานเสี่ยงต้องรอคุณอนุมัติ ปิดไว้เป็นค่าเริ่มต้น' },
  ],
  panel: {
    labels: ['CV ของคุณ', 'ค้นหางาน', 'ผลประเมิน', 'เอกสาร', 'Agent Console'],
    cvMeta: 'อ่านข้อความแล้ว · 2 หน้า',
    ready: 'พร้อมใช้',
    parsed: 'ทักษะที่อ่านได้จาก CV',
    skills: ['React', 'TypeScript', 'Tailwind', 'Git', 'REST', 'Vite'],
    searchValue: 'Frontend Developer',
    searchLabel: 'คำค้นหา',
    letterTitle: 'Cover letter · Frontend Developer',
    letterRev: 'ฉบับที่ 1',
    letterGreeting: 'เรียน ฝ่ายทรัพยากรบุคคล',
    doors: 'ช่องทางเชื่อมต่อ',
  },
  diffTitle: 'สองสิ่งที่ต่างจากเว็บหางานทั่วไป',
  local: {
    title: 'ทำงานบนเครื่องคุณ',
    body: 'แอปรันบนเครื่องของคุณ คีย์ AI เก็บใน Keychain ของ macOS และไม่ส่งใบสมัครแทนคุณ ข้อมูล CV ที่จำเป็นจะถูกส่งไปยังผู้ให้บริการ AI ที่คุณเลือกเท่านั้น',
    rows: ['รันบนเครื่องของคุณ · localhost', 'คีย์ AI ใน Keychain · ••••••••', 'CV ส่งไปเฉพาะผู้ให้บริการ AI ที่เลือก'],
    submit: 'ส่งใบสมัคร',
    submitNote: 'ไม่ส่งแทนคุณ',
  },
  agent: {
    title: 'เชื่อมกับ agent ภายนอกได้',
    body: 'เปิดให้ agent ของคุณเรียกผ่าน REST, MCP หรือ A2A ด้วย access token ที่จำกัดสิทธิ์และเพิกถอนได้ งานเสี่ยงต้องรอคุณอนุมัติ ปิดไว้เป็นค่าเริ่มต้น',
    token: 'my-agent',
    scopes: 'อ่านผลลัพธ์ · ประเมินงาน',
    revoke: 'เพิกถอน',
    request: 'ขออนุมัติ: ร่างเอกสาร · Full-stack Engineer',
    approve: 'อนุมัติ',
    reject: 'ปฏิเสธ',
  },
  facts: [
    { value: '15', label: 'ผู้ให้บริการ AI ที่รองรับ' },
    { value: '3', label: 'ช่องทางสำหรับ agent (REST · MCP · A2A)' },
    { value: '2', label: 'ภาษา ไทย / อังกฤษ' },
  ],
  closing: 'พร้อมเริ่มสมัครงานแบบตรงจุดหรือยัง',
  credit: 'แหล่งข้อมูลงานโอเพนซอร์ส (MIT)',
};

const en: typeof th = {
  headlineA: 'Apply with precision,',
  headlineB: 'with an AI that runs on your machine',
  sub: 'Add your CV and a job posting, get a fit evaluation and tailored application documents — you review and submit every time.',
  cta: 'Get started',
  secondary: 'See how it works',
  caption: 'Illustrations from the real app screens · sample data',
  cards: { fit: 'Fit', skills: 'Skills matched', tasks: 'Agent tasks', stale: 'Stale listing · 23 days' },
  statement: {
    muted: 'Typical job boards hand you a list of jobs to read through yourself.',
    accent: 'This app evaluates every job against your CV, with reasons you can check.',
  },
  tourTitle: 'How it works',
  tourLabel: 'Steps',
  steps: [
    { tab: 'Add CV', eyebrow: 'Add your CV once', title: 'Attach your CV once, use it for every job', body: 'Upload a CV and the app reads your skills and experience. Your original CV is never edited.' },
    { tab: 'Search', eyebrow: 'Find real jobs in Thailand', title: 'Search real listings in Thailand', body: 'Search an open-source job catalogue, see how old each posting is, get warned when a listing looks stale, and open the original. Only search terms leave your machine.' },
    { tab: 'Evaluate', eyebrow: 'Evaluate with AI + skills', title: 'A score with reasons you can check', body: 'The AI reads the posting against your CV and scores it with reasons. Matched skills are counted from keywords, without AI, and kept apart from the score.' },
    { tab: 'Draft', eyebrow: 'Draft tailored documents', title: 'A CV and cover letter for the role', body: 'Get drafts tailored to the posting, versioned, for you to review before use. The app never submits an application for you.' },
    { tab: 'Connect', eyebrow: 'Connect your AI agent', title: 'Plug in the agent you already use', body: 'Let an outside agent call in over REST, MCP or A2A. Every task shows in Agent Console and risky ones wait for your approval. Off by default.' },
  ],
  panel: {
    labels: ['Your CV', 'Job search', 'Evaluation', 'Documents', 'Agent Console'],
    cvMeta: 'Text read · 2 pages',
    ready: 'Ready',
    parsed: 'Skills read from your CV',
    skills: ['React', 'TypeScript', 'Tailwind', 'Git', 'REST', 'Vite'],
    searchValue: 'Frontend Developer',
    searchLabel: 'Search',
    letterTitle: 'Cover letter · Frontend Developer',
    letterRev: 'Revision 1',
    letterGreeting: 'Dear Hiring Manager,',
    doors: 'Ways to connect',
  },
  diffTitle: 'Two things other job boards do not do',
  local: {
    title: 'Runs on your machine',
    body: 'The app runs on your computer, AI keys live in macOS Keychain, and it never submits an application for you. CV content needed for a request goes only to the AI provider you choose.',
    rows: ['Runs on your machine · localhost', 'AI key in Keychain · ••••••••', 'CV goes only to your chosen AI provider'],
    submit: 'Submit application',
    submitNote: 'Never done for you',
  },
  agent: {
    title: 'Connects to outside agents',
    body: 'Let your own agent call in over REST, MCP or A2A with scoped, revocable access tokens. Risky actions wait for your approval. Off by default.',
    token: 'my-agent',
    scopes: 'Read results · Evaluate',
    revoke: 'Revoke',
    request: 'Approval needed: draft documents · Full-stack Engineer',
    approve: 'Approve',
    reject: 'Reject',
  },
  facts: [
    { value: '15', label: 'supported AI providers' },
    { value: '3', label: 'channels for agents (REST · MCP · A2A)' },
    { value: '2', label: 'languages, Thai and English' },
  ],
  closing: 'Ready to apply with precision?',
  credit: 'Open-source job data source (MIT)',
};

export const landingCopy: Record<'th' | 'en', typeof th> = { th, en };

type SampleJob = { title: string; company: string; place: string; mode: string; age: string; stale: boolean; skills: string[]; blurb: string };
type SampleRun = { op: string; job: string; status: 'completed' | 'running' | 'waiting_approval'; score: number | null; origin: string };

export const previewCopy: Record<'th' | 'en', {
  job: string; reasons: string[]; docs: { name: string; rev: string }[]; download: string;
  jobs: SampleJob[]; evaluate: string; staleLabel: string;
  consoleLabel: string; runs: SampleRun[];
}> = {
  th: {
    job: 'Frontend Developer · บริษัทตัวอย่าง จำกัด',
    reasons: ['ทักษะ React และ TypeScript ตรงกับประกาศ', 'ประสบการณ์ 3 ปีตามที่ต้องการ', 'ยังไม่มีประสบการณ์ด้านทดสอบอัตโนมัติ'],
    docs: [{ name: 'CV ฉบับปรับสำหรับตำแหน่ง', rev: 'ฉบับที่ 2' }, { name: 'Cover letter', rev: 'ฉบับที่ 1' }],
    download: 'ดาวน์โหลด',
    evaluate: 'ประเมินงานนี้',
    staleLabel: 'ประกาศเก่า',
    jobs: [
      { title: 'Frontend Developer', company: 'บริษัทตัวอย่าง จำกัด', place: 'กรุงเทพฯ', mode: 'ไฮบริด', age: 'ลงประกาศ 3 วันก่อน', stale: false, skills: ['React', 'TypeScript'], blurb: 'พัฒนาหน้าเว็บของผลิตภัณฑ์ร่วมกับทีมดีไซน์และแบ็กเอนด์' },
      { title: 'Data Analyst', company: 'บริษัทตัวอย่าง จำกัด', place: 'กรุงเทพฯ', mode: 'ที่ออฟฟิศ', age: 'ลงประกาศ 52 วันก่อน', stale: true, skills: ['SQL'], blurb: 'วิเคราะห์ข้อมูลและจัดทำรายงานให้ทีมธุรกิจ' },
    ],
    consoleLabel: 'งานของเอเจนต์',
    runs: [
      { op: 'ประเมินงาน', job: 'Frontend Developer', status: 'completed', score: 4.2, origin: 'ผ่าน A2A' },
      { op: 'ร่างเอกสาร', job: 'Frontend Developer', status: 'running', score: null, origin: 'ผ่านเว็บ' },
      { op: 'ร่างเอกสาร', job: 'Full-stack Engineer', status: 'waiting_approval', score: null, origin: 'ผ่าน MCP' },
    ],
  },
  en: {
    job: 'Frontend Developer · Sample Company Ltd.',
    reasons: ['React and TypeScript skills match the posting', '3 years of experience as requested', 'No automated-testing experience yet'],
    docs: [{ name: 'CV tailored for the role', rev: 'Revision 2' }, { name: 'Cover letter', rev: 'Revision 1' }],
    download: 'Download',
    evaluate: 'Evaluate job',
    staleLabel: 'Stale listing',
    jobs: [
      { title: 'Frontend Developer', company: 'Sample Company Ltd.', place: 'Bangkok', mode: 'Hybrid', age: 'Posted 3 days ago', stale: false, skills: ['React', 'TypeScript'], blurb: 'Build the product web UI with the design and backend teams.' },
      { title: 'Data Analyst', company: 'Sample Company Ltd.', place: 'Bangkok', mode: 'On-site', age: 'Posted 52 days ago', stale: true, skills: ['SQL'], blurb: 'Analyse data and prepare reports for business teams.' },
    ],
    consoleLabel: 'Agent tasks',
    runs: [
      { op: 'Evaluate job', job: 'Frontend Developer', status: 'completed', score: 4.2, origin: 'via A2A' },
      { op: 'Draft documents', job: 'Frontend Developer', status: 'running', score: null, origin: 'via web' },
      { op: 'Draft documents', job: 'Full-stack Engineer', status: 'waiting_approval', score: null, origin: 'via MCP' },
    ],
  },
};
