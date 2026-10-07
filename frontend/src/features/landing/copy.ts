export const landingCopy = {
  th: {
    headline: 'สมัครงานให้ตรงจุด ด้วย AI ที่ทำงานบนเครื่องคุณ',
    sub: 'ใส่ CV กับประกาศงาน แล้วรับผลประเมินความเหมาะสมและเอกสารสมัครงานที่ปรับให้ตรงตำแหน่ง — คุณตรวจและส่งเองทุกครั้ง',
    cta: 'เริ่มใช้งาน',
    secondary: 'ดูวิธีทำงาน',
    howTitle: 'วิธีทำงาน',
    tabs: { evaluate: 'ประเมินงาน', documents: 'เอกสาร', search: 'ค้นหางาน', console: 'Agent Console' },
    sample: 'ตัวอย่าง',
    steps: [
      { title: 'ค้นหางานจริงในไทย', body: 'ค้นจากประกาศงานจริงในไทย ดูอายุประกาศ และเปิดประกาศต้นฉบับได้' },
      { title: 'ประเมินความเหมาะสม', body: 'AI อ่านประกาศงานเทียบกับ CV ของคุณ แล้วให้คะแนนพร้อมเหตุผล' },
      { title: 'ร่างเอกสารที่ปรับแล้ว', body: 'ร่าง CV และ Cover letter ตามตำแหน่ง ให้คุณตรวจก่อนใช้ CV ต้นฉบับไม่ถูกแก้' },
      { title: 'ติดตามและควบคุม', body: 'บันทึกสถานะ บันทึกไว้/สมัครแล้ว และอนุมัติการเปลี่ยนแปลงสำคัญด้วยตัวคุณเอง' },
    ],
    realTitle: 'ค้นหางานจริงในไทย',
    realBody: 'แอปค้นประกาศงานไทยแบบสดจากแคตตาล็อกงานโอเพนซอร์ส แล้วแสดงอายุประกาศ พร้อมเตือนเมื่อเป็นประกาศเก่าที่อาจปิดรับแล้ว และลิงก์ไปยังประกาศต้นฉบับ',
    realPoints: ['ดูอายุประกาศและป้ายเตือนประกาศเก่า', 'เปิดประกาศต้นฉบับเพื่อสมัครเอง', 'ส่งออกจากเครื่องเฉพาะคำค้นหา ไม่ส่ง CV ของคุณ'],
    realCredit: 'แหล่งข้อมูลงานโอเพนซอร์ส (MIT)',
    realSampleLabel: 'ตัวอย่างรายการค้นหา',
    connectTitle: 'เชื่อมกับ AI agent ของคุณ',
    connectLead: 'สามประตู แกนเอเจนต์เดียว',
    doors: [
      { title: 'REST', body: 'ให้แอปหรือสคริปต์ของคุณเรียกใช้งานผ่าน HTTP โดยตรง' },
      { title: 'MCP (streamable HTTP)', body: 'ต่อกับ MCP client หรือเครื่องมือ AI ที่รองรับ MCP' },
      { title: 'A2A (Agent Card)', body: 'เอเจนต์อื่นค้นพบความสามารถของแอปจาก Agent Card ที่' },
    ],
    connectPoints: [
      'งานที่เอเจนต์ภายนอกเริ่มจะแสดงใน Agent Console ด้วยรหัสงานเดียวกัน',
      'Access token จำกัดสิทธิ์ (อ่านผลลัพธ์ / ประเมินงาน / ร่างเอกสาร) และเพิกถอนได้',
      'การกระทำที่เสี่ยงต้องรอให้คุณอนุมัติก่อน',
    ],
    connectNote: 'การเปิดให้เอเจนต์ภายนอกเข้าถึงปิดอยู่เป็นค่าเริ่มต้น เปิดเมื่อคุณต้องการเท่านั้น',
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
    tabs: { evaluate: 'Evaluate', documents: 'Documents', search: 'Job search', console: 'Agent Console' },
    sample: 'Sample',
    steps: [
      { title: 'Find real jobs in Thailand', body: 'Search real Thai listings, see how old each posting is, and open the original.' },
      { title: 'Evaluate the fit', body: 'The AI reads the job posting against your CV and scores it with reasons.' },
      { title: 'Draft tailored documents', body: 'Draft a CV and cover letter for the role, for you to review. Your original CV is never edited.' },
      { title: 'Track and stay in control', body: 'Mark jobs saved or applied, and approve any significant change yourself.' },
    ],
    realTitle: 'Search real jobs in Thailand',
    realBody: 'The app searches live Thai listings from an open-source job catalogue, shows how old each posting is, warns when a listing looks stale and may have closed, and links to the original posting.',
    realPoints: ['See posting age and stale-listing warnings', 'Open the original posting to apply yourself', 'Only search terms leave your machine; your CV does not'],
    realCredit: 'Open-source job data source (MIT)',
    realSampleLabel: 'Sample search results',
    connectTitle: 'Connect your own AI agent',
    connectLead: 'Three doors, one agent core',
    doors: [
      { title: 'REST', body: 'Let your own app or script call the agent over plain HTTP.' },
      { title: 'MCP (streamable HTTP)', body: 'Connect an MCP client or any AI tool that speaks MCP.' },
      { title: 'A2A (Agent Card)', body: 'Other agents discover what this app can do from the Agent Card at' },
    ],
    connectPoints: [
      'Tasks started by an external agent appear in Agent Console with the same task id.',
      'Access tokens are scoped (read results / evaluate / draft) and revocable.',
      'Risky actions wait for your approval.',
    ],
    connectNote: 'External access is off by default. Turn it on only when you need it.',
    privacyTitle: 'Your data stays with you',
    privacy: ['Runs on your machine', 'AI keys live in macOS Keychain', 'Never submits applications for you'],
    privacyNote: 'CV content needed for a request goes to the AI provider you choose.',
    closing: 'Ready to apply with precision?',
  },
};

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
