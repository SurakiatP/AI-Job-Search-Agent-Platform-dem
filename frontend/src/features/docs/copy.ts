type Topic = { title: string; body: string };
export const docsCopy = {
  th: {
    title: 'คู่มือการใช้งาน', intro: 'ทุกอย่างที่ผู้ใช้ใหม่ควรรู้ ตั้งแต่ใส่ CV จนถึงติดตามใบสมัคร',
    home: 'กลับหน้าแรก', start: 'เริ่มใช้งาน', openApp: 'เปิดแอป', quick: 'เริ่มใน 3 ขั้นตอน', topics: 'หัวข้อในคู่มือ', read: 'อ่านหัวข้อนี้', onThisPage: 'ในหน้านี้', madeUp: 'ข้อมูลสมมุติ', back: 'หัวข้อทั้งหมด', backToGuide: 'กลับไปคู่มือ', notFound: 'ไม่พบหัวข้อนี้ในคู่มือ', loading: 'กำลังโหลด…', pager: 'หัวข้อก่อนหน้าและถัดไป', topicOf: (n: number, total: number) => `หัวข้อที่ ${n} จาก ${total}`,
    list: [
      { title: 'เริ่มต้นใช้งาน', body: 'สร้างบัญชี ยืนยันอีเมล และสร้างโปรเจกต์แรกของคุณ' },
      { title: 'เพิ่ม CV และคลังประสบการณ์', body: 'อัปโหลด CV ให้ AI สกัดประสบการณ์ แล้วตรวจและแก้ไขเองได้' },
      { title: 'สร้าง CV ในระบบ', body: 'กรอกข้อมูล เลือกเทมเพลต ดูตัวอย่าง แล้วบันทึกเป็น CV ที่เอเจนต์ AI ใช้ประเมินและปรับให้ได้ทันที' },
      { title: 'ค้นหาและประเมินงาน', body: 'ค้นประกาศงานจริงในไทย ใช้ Smart match และอ่านผลประเมินพร้อมเหตุผล' },
      { title: 'ปรับ CV และร่างเอกสาร', body: 'ให้เอเจนต์ปรับ CV และร่างจดหมาย โดยใช้เฉพาะข้อมูลที่คุณมีจริง' },
      { title: 'ซ้อมสัมภาษณ์', body: 'สร้างชุดคำถามจากการประเมินงาน ซ้อมตอบ ทบทวนด้วยแฟลชการ์ด และขอความเห็นจาก AI' },
      { title: 'ติดตามใบสมัคร', body: 'ลากการ์ดบนบอร์ดเพื่อบันทึกสถานะ แอปไม่ส่งใบสมัครแทนคุณ' },
      { title: 'แจ้งเตือนงานใหม่', body: 'บันทึกการค้นหา แล้วรับสรุปงานใหม่ทางอีเมล Telegram หรือ webhook' },
      { title: 'ความปลอดภัยและข้อมูลของคุณ', body: 'ข้อมูลแต่ละโปรเจกต์แยกกัน และสิ่งที่อาจถูกส่งไปยังบริการ AI' },
    ] satisfies Topic[],
  },
  en: {
    title: 'User guide', intro: 'Everything a new user needs, from adding a CV to tracking applications.',
    home: 'Back to home', start: 'Get started', openApp: 'Open app', quick: 'Start in 3 steps', topics: 'Topics in the guide', read: 'Read this topic', onThisPage: 'On this page', madeUp: 'made-up data', back: 'All topics', backToGuide: 'Back to the guide', notFound: 'This topic is not in the guide', loading: 'Loading…', pager: 'Previous and next topic', topicOf: (n: number, total: number) => `Topic ${n} of ${total}`,
    list: [
      { title: 'Getting started', body: 'Create an account, verify your email and make your first project.' },
      { title: 'Add your CV and experience bank', body: 'Upload a CV, let AI extract your experience, then check and edit it yourself.' },
      { title: 'Build a CV in the app', body: 'Fill in your details, pick a template, preview it and save it as a CV the AI agents can evaluate and tailor straight away.' },
      { title: 'Search and evaluate jobs', body: 'Search real jobs in Thailand, use Smart match and read the evaluation with its reasons.' },
      { title: 'Tailor your CV and draft documents', body: 'Let the agent tailor your CV and draft letters, using only what you really have.' },
      { title: 'Interview practice', body: 'Create question sets from a job evaluation, practise answers, review with flashcards and get AI feedback.' },
      { title: 'Track applications', body: 'Drag cards on the board to record status. The app never submits for you.' },
      { title: 'Job alerts', body: 'Save a search and get new-job digests by email, Telegram or webhook.' },
      { title: 'Security and your data', body: 'Each project is kept separate, and what may be sent to an AI service.' },
    ] satisfies Topic[],
  },
};
