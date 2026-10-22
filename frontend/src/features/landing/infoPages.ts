// Text of the two public explainer pages behind the header menu: how the app works end to end, and what happens to your data.
type Block = { title: string; body: string };
export type InfoPage = { title: string; lead: string; sections: { heading: string; items: Block[] }[]; note: string };
export const infoSlugs = ['how-it-works', 'data'] as const;
export type InfoSlug = (typeof infoSlugs)[number];

const th: Record<InfoSlug, InfoPage> = {
  'how-it-works': {
    title: 'วิธีทำงานของแอป ตั้งแต่ CV จนถึงการสมัคร',
    lead: 'แอปช่วยเตรียมตัวสมัครงานทีละขั้น คุณเป็นคนตรวจและตัดสินใจทุกขั้น ส่วน AI ช่วยอ่าน เทียบ และร่าง',
    sections: [
      { heading: 'สิ่งที่ต้องมีก่อน', items: [
        { title: 'บัญชีที่ยืนยันอีเมลแล้ว', body: 'สร้างบัญชี ใส่รหัส 6 หลักที่ส่งไปทางอีเมล แล้วเข้าสู่ระบบ' },
        { title: 'โปรเจกต์และ CV หนึ่งฉบับ', body: 'โปรเจกต์คือพื้นที่ทำงานหนึ่งการค้นหา มี CV ผลประเมินและใบสมัครของตัวเอง' },
        { title: 'ผู้ให้บริการ AI', body: 'ฟีเจอร์ที่ใช้ AI (สกัดประสบการณ์ ประเมิน ร่างเอกสาร Smart match) ต้องตั้งค่าผู้ให้บริการ AI ก่อน การค้นหางานปกติไม่ต้องใช้' },
      ] },
      { heading: 'ลำดับการทำงาน', items: [
        { title: '1. เพิ่ม CV', body: 'อัปโหลด CV แล้วสกัดประสบการณ์เก็บเป็นคลังข้อเท็จจริงของคุณ' },
        { title: '2. ค้นหางาน', body: 'ค้นประกาศงานจริงในไทย ดูอายุประกาศ และให้ Smart match จัดอันดับตาม CV เมื่อคุณกดเริ่ม' },
        { title: '3. ประเมิน', body: 'เทียบ CV กับประกาศหนึ่งฉบับ ได้ความเหมาะสมโดย AI พร้อมเหตุผล และทักษะที่พบที่นับจากคำสำคัญ' },
        { title: '4. ร่างเอกสาร', body: 'ปรับ CV และร่างจดหมาย โดยอ้างเฉพาะข้อเท็จจริงในคลังประสบการณ์ของคุณ' },
        { title: '5. ตรวจและติดตาม', body: 'คุณตรวจเอกสาร สมัครเองกับนายจ้าง แล้วลากการ์ดบนบอร์ดเพื่อบันทึกความคืบหน้า' },
      ] },
    ],
    note: 'แอปไม่ส่งใบสมัครอัตโนมัติ คุณตรวจเองและสมัครเองทุกครั้ง',
  },
  data: {
    title: 'ข้อมูลของคุณและการเชื่อมต่อกับ agent',
    lead: 'บอกตรง ๆ ว่าข้อมูลอยู่ที่ไหน อะไรอาจถูกส่งออกไป และคุณคุมอะไรได้บ้าง',
    sections: [
      { heading: 'ข้อมูลของคุณ', items: [
        { title: 'แยกตามโปรเจกต์', body: 'CV ผลประเมิน และเอกสารของแต่ละโปรเจกต์แยกจากกัน' },
        { title: 'CV ต้นฉบับไม่ถูกแก้', body: 'การปรับ CV สร้างเป็นเวอร์ชันใหม่เสมอ' },
        { title: 'บริการ AI ภายนอก', body: 'เมื่อใช้ฟีเจอร์ AI ข้อมูล CV เท่าที่จำเป็นอาจถูกส่งไปยังบริการ AI ที่ตั้งค่าไว้' },
        { title: 'ลบบัญชีได้เอง', body: 'ยืนยันด้วยรหัสทางอีเมล ข้อมูลส่วนบุคคล CV บทสนทนา และโทเคนจะถูกลบหรือทำให้ไม่ระบุตัวตนภายใน 30 วัน' },
      ] },
      { heading: 'เชื่อมกับ agent ภายนอก', items: [
        { title: 'คุณกำหนดขอบเขต', body: 'agent ขอสิทธิ์ผ่านหน้าอนุญาต คุณเห็นว่าขออะไร กับโปรเจกต์ไหน' },
        { title: 'งานเสี่ยงรอคุณอนุมัติ', body: 'สิทธิ์ที่เขียนข้อมูลปิดไว้เป็นค่าเริ่มต้น และต้องเลือกอนุญาตเอง' },
        { title: 'เพิกถอนได้ทันที', body: 'ดูรายชื่อ agent ที่ได้สิทธิ์และเพิกถอนได้จากหน้าบัญชี' },
        { title: 'ข้อความจากภายนอกไม่ใช่คำสั่ง', body: 'ประกาศงานและเอกสารที่ agent อ่านเป็นข้อมูลที่ไม่น่าเชื่อถือ ไม่เปลี่ยนสิทธิ์หรือการตั้งค่าของคุณ' },
      ] },
    ],
    note: 'ใช้ได้ทั้งการอนุญาตผ่านหน้าอนุญาตและโทเคนสำรอง โดยโทเคนและการให้สิทธิ์ต้องใช้บัญชีที่ยืนยันอีเมลแล้ว',
  },
};

const en: Record<InfoSlug, InfoPage> = {
  'how-it-works': {
    title: 'How the app works, from CV to application',
    lead: 'The app prepares your application one step at a time. You review and decide at every step; AI helps read, compare and draft.',
    sections: [
      { heading: 'What you need first', items: [
        { title: 'A verified account', body: 'Sign up, enter the 6-digit code sent to your email, then log in.' },
        { title: 'A project and one CV', body: 'A project is one job search with its own CV, evaluations and applications.' },
        { title: 'An AI provider', body: 'Features that use AI (extract experience, evaluate, draft documents, Smart match) need an AI provider set up first. Plain job search does not.' },
      ] },
      { heading: 'The flow', items: [
        { title: '1. Add your CV', body: 'Upload a CV and extract your experience into a bank of facts about you.' },
        { title: '2. Search jobs', body: 'Search real jobs in Thailand, see posting age, and let Smart match rank them against your CV when you press start.' },
        { title: '3. Evaluate', body: 'Compare your CV with one posting: an AI fit with reasons, and skills found counted from keywords.' },
        { title: '4. Draft documents', body: 'Tailor your CV and draft letters, citing only facts in your experience bank.' },
        { title: '5. Review and track', body: 'You review the documents, apply with the employer yourself, then drag cards on the board to record progress.' },
      ] },
    ],
    note: 'The app never submits applications automatically. You review and apply yourself every time.',
  },
  data: {
    title: 'Your data and connecting an agent',
    lead: 'Plainly: where your data lives, what may leave it, and what you control.',
    sections: [
      { heading: 'Your data', items: [
        { title: 'Separate per project', body: 'The CV, evaluations and documents of each project are kept apart.' },
        { title: 'Your original CV is never changed', body: 'Tailoring always creates a new version.' },
        { title: 'External AI services', body: 'When you use an AI feature, the CV content it needs may be sent to the AI service you configured.' },
        { title: 'Delete your account yourself', body: 'Confirm with a code by email. Personal data, CVs, conversations and tokens are deleted or anonymised within 30 days.' },
      ] },
      { heading: 'Connecting an external agent', items: [
        { title: 'You set the limits', body: 'An agent asks for permissions on a consent page. You see what it asks for and which project.' },
        { title: 'Risky work waits for you', body: 'Permissions that write data are off by default and must be allowed by you.' },
        { title: 'Revoke at once', body: 'See the agents you have allowed and revoke them from the account page.' },
        { title: 'Outside text is not an instruction', body: 'Job postings and documents an agent reads are untrusted data. They cannot change your permissions or settings.' },
      ] },
    ],
    note: 'Both consent-page access and a fallback token work. Tokens and grants need an account with a verified email.',
  },
};

export const infoPages: Record<'th' | 'en', Record<InfoSlug, InfoPage>> = { th, en };
