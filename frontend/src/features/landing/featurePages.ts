// One explainer page per product feature, in the same order as the landing tour (copy.ts `steps`).
export const featureSlugs = ['add-cv', 'search', 'evaluate', 'draft', 'connect'] as const;
export type FeatureSlug = (typeof featureSlugs)[number];

type Page = { title: string; lead: string; steps: { title: string; body: string }[]; good: string[]; note: string };
type Pages = Record<FeatureSlug, Page>;

const th: Pages = {
  'add-cv': {
    title: 'ใส่ CV ครั้งเดียว ใช้ได้กับทุกงาน',
    lead: 'CV เป็นจุดเริ่มต้นของทุกอย่าง อัปโหลดครั้งเดียว แล้วแอปใช้ CV ฉบับนั้นเทียบกับทุกประกาศงานในโปรเจกต์',
    steps: [
      { title: 'อัปโหลดไฟล์ CV', body: 'รองรับ PDF, DOCX หรือวางเป็นข้อความ ไฟล์อยู่ในโปรเจกต์ของคุณเท่านั้น' },
      { title: 'แอปอ่านทักษะและประสบการณ์', body: 'ดูข้อความและทักษะที่อ่านได้จาก CV ได้ทันที เพื่อเช็กว่าอ่านถูกต้อง' },
      { title: 'สกัดประสบการณ์ด้วย AI', body: 'กด "สกัดประสบการณ์จาก CV ด้วย AI" เพื่อสร้างคลังประสบการณ์ แล้วตรวจและแก้ไขข้อมูลเองได้' },
      { title: 'CV แต่ละฉบับเก็บเป็นเวอร์ชัน', body: 'เมื่อมีการแก้ จะได้เวอร์ชันใหม่ ส่วนเวอร์ชันเดิมและ CV ต้นฉบับของคุณไม่ถูกแก้ไข' },
    ],
    good: ['การสกัดประสบการณ์ใช้ AI จึงต้องตั้งค่าผู้ให้บริการ AI ก่อน', 'ข้อมูล CV เท่าที่จำเป็นอาจถูกส่งไปยังบริการ AI ภายนอก'],
    note: 'คลังประสบการณ์คือแหล่งข้อเท็จจริงเดียวที่เอเจนต์ใช้เวลาปรับ CV ให้คุณ',
  },
  search: {
    title: 'ค้นประกาศงานจริงในไทย',
    lead: 'ค้นหางานจากประกาศจริง ดูว่าประกาศอายุเท่าไหร่ และรู้ก่อนว่าประกาศไหนอาจปิดรับแล้ว',
    steps: [
      { title: 'ค้นด้วยคำสำคัญและตัวกรอง', body: 'ค้นด้วยตำแหน่ง บริษัท หรือทักษะ แล้วกรองตามสถานที่ รูปแบบการทำงาน และตัวกรองเพิ่มเติม' },
      { title: 'ดูอายุประกาศและคำเตือน', body: 'ทุกผลลัพธ์บอกอายุประกาศ ถ้าอาจเป็นประกาศเก่า จะบอกเหตุผล เช่น ลงมานานแล้ว หรือไม่พบในแหล่งงานตอนตรวจล่าสุด' },
      { title: 'จัดอันดับด้วย Smart match', body: 'กดเริ่มเอง แล้ว AI จัดอันดับงานตาม CV ของคุณ ผลลัพธ์แสดงความเหมาะสม x / 5 และทักษะที่พบแยกกัน' },
      { title: 'บันทึกหรือประเมินต่อ', body: 'บันทึกงานที่สนใจ เริ่มประเมินงานนั้นกับ CV ของคุณ หรือเปิดประกาศต้นฉบับ' },
    ],
    good: ['ค้นได้เฉพาะงานในไทย', 'Smart match ใช้โทเคน AI จึงไม่ทำงานเองจนกว่าคุณจะกดเริ่ม'],
    note: 'คำเตือนประกาศเก่าอ้างอิงข้อมูลที่แอปเก็บไว้จริง ไม่ใช่การเดาเจตนาของนายจ้าง',
  },
  evaluate: {
    title: 'คะแนนที่มีเหตุผลให้ตรวจ',
    lead: 'การประเมินเทียบ CV ฉบับที่เลือกกับประกาศงานฉบับหนึ่ง แล้วให้ผลที่ตรวจย้อนได้ ไม่ใช่แค่ตัวเลขลอย ๆ',
    steps: [
      { title: 'เลือก CV และประกาศงาน', body: 'เริ่มเซสชันประเมินจากผลการค้นหา ระบบจำว่าใช้ CV ฉบับไหนกับประกาศฉบับไหน' },
      { title: 'AI อ่านและให้คะแนน', body: 'ได้ความเหมาะสมโดย AI เป็น x / 5 พร้อมรายงานเทียบแต่ละข้อกับหลักฐานจาก CV' },
      { title: 'นับทักษะที่พบแยกต่างหาก', body: 'ทักษะที่พบ n จาก m นับจากคำสำคัญโดยไม่ใช้ AI และแสดงแยกจากคะแนน AI' },
      { title: 'ดูหลักฐาน', body: 'เปิดดูหลักฐานที่ใช้ตัดสินแต่ละข้อได้ จะได้รู้ว่าจุดแข็งและช่องว่างอยู่ตรงไหน' },
    ],
    good: ['การประเมินใช้เวลาประมาณสองสามนาที', 'ใช้ AI จึงต้องตั้งค่าผู้ให้บริการ AI ก่อน'],
    note: 'คะแนนเป็นค่าประมาณจาก AI ใช้ประกอบการตัดสินใจ ไม่ใช่การทำนายว่าจะได้งาน',
  },
  draft: {
    title: 'ร่าง CV และจดหมายสมัครงานตามตำแหน่ง',
    lead: 'ให้เอเจนต์ช่วยปรับ CV และร่างจดหมายให้ตรงกับประกาศ โดยใช้เฉพาะสิ่งที่คุณมีจริง',
    steps: [
      { title: 'เลือกสิ่งที่จะให้ร่าง', body: 'ร่างจดหมายสมัครงาน ข้อความสมัครงาน หรือปรับ CV ให้เข้ากับงาน เลือกภาษาของเอกสารได้' },
      { title: 'เลือกโหมดการปรับ CV', body: 'อัตโนมัติ: เอเจนต์ปรับและบันทึกเป็นเวอร์ชันใหม่ให้เลย  เลือกเอง: คุณบอกว่าอยากปรับอะไรมากแค่ไหน แล้วเลือกข้อเสนอก่อนบันทึก' },
      { title: 'ตัวตรวจหลักฐานกันข้อมูลเกินจริง', body: 'ข้อเสนอที่อ้างสิ่งที่ไม่มีในคลังประสบการณ์ของคุณจะถูกปิดและเลือกไม่ได้' },
      { title: 'ตรวจก่อนใช้ทุกครั้ง', body: 'เอกสารแต่ละฉบับเก็บเป็นเวอร์ชัน คุณเปิดอ่านและเลือกใช้เอง' },
    ],
    good: ['ถ้างานต้องการทักษะที่คุณไม่มี แอปจะไม่เพิ่มให้ แต่จะบอกให้เพิ่มทักษะนั้นเมื่อคุณมีจริง', 'แอปไม่ส่งใบสมัครแทนคุณ'],
    note: 'ไม่มีการเดาหรือแต่งข้อมูลเพิ่ม ทุกข้อความใน CV ที่ปรับต้องอ้างกลับไปที่ข้อเท็จจริงในคลังประสบการณ์ได้',
  },
  connect: {
    title: 'ต่อกับ agent ที่คุณใช้อยู่',
    lead: 'ให้ผู้ช่วย AI ภายนอกที่คุณใช้อยู่ช่วยงานในโปรเจกต์ของคุณ โดยคุณคุมสิทธิ์และอนุมัติงานเสี่ยงเอง',
    steps: [
      { title: 'เปิดหน้าเชื่อมต่อ', body: 'ในหน้ากิจกรรมเอเจนต์ แท็บ "เชื่อมต่อ" แสดงที่อยู่สำหรับ MCP, agent card และ A2A พร้อมตัวอย่างการตั้งค่า' },
      { title: 'ให้สิทธิ์เท่าที่ต้องใช้', body: 'agent ขอสิทธิ์ผ่านหน้าอนุญาต คุณเห็นว่าขอสิทธิ์อะไร กับโปรเจกต์ไหน และเลือกอนุญาตหรือปฏิเสธเอง' },
      { title: 'ดูงานของ agent ทั้งหมด', body: 'งานทุกชิ้นที่ agent ทำแสดงในหน้ากิจกรรม พร้อมขั้นตอนและสถานะ' },
      { title: 'อนุมัติหรือเพิกถอนได้ทันที', body: 'งานที่มีความเสี่ยงต้องรอคุณอนุมัติ และคุณเพิกถอนสิทธิ์ของ agent ได้จากหน้าบัญชี' },
    ],
    good: ['สิทธิ์ที่เขียนข้อมูลต้องเลือกอนุญาตเองทีละอย่าง', 'ข้อมูลของแต่ละโปรเจกต์แยกจากกัน agent เข้าถึงเฉพาะโปรเจกต์ที่คุณอนุญาต'],
    note: 'ประกาศงานและเอกสารที่ agent อ่านเป็นข้อมูลที่ไม่น่าเชื่อถือ ไม่มีผลต่อสิทธิ์หรือการตั้งค่าของคุณ',
  },
};

const en: Pages = {
  'add-cv': {
    title: 'Add your CV once, use it for every job',
    lead: 'Your CV is where everything starts. Upload it once and the app compares that CV with every job posting in the project.',
    steps: [
      { title: 'Upload your CV file', body: 'PDF, DOCX or pasted text. The file stays in your project only.' },
      { title: 'The app reads skills and experience', body: 'See the text and skills it read from your CV straight away, to check it was read correctly.' },
      { title: 'Extract experience with AI', body: 'Press "Extract experience from CV with AI" to build your experience bank, then check and edit it yourself.' },
      { title: 'Each CV is kept as a version', body: 'Edits create a new version. Earlier versions and your original CV are never changed.' },
    ],
    good: ['Extraction uses AI, so an AI provider must be set up first.', 'The CV data needed may be sent to an external AI service.'],
    note: 'The experience bank is the single source of facts the agent uses when it tailors your CV.',
  },
  search: {
    title: 'Search real jobs in Thailand',
    lead: 'Search real postings, see how old each one is, and know in advance which ones may already be closed.',
    steps: [
      { title: 'Search with keywords and filters', body: 'Search by role, company or skill, then filter by location, work mode and more filters.' },
      { title: 'See the age and the warning', body: 'Every result shows its age. If it may be old, you get the reason, such as posted long ago or not found on the source at the last check.' },
      { title: 'Rank with Smart match', body: 'You press start, then AI ranks the jobs against your CV. AI fit (x / 5) and skills found are shown separately.' },
      { title: 'Save or evaluate next', body: 'Save a job, start evaluating it with your CV, or open the original posting.' },
    ],
    good: ['Search covers jobs in Thailand only.', 'Smart match uses AI tokens, so it never runs until you press start.'],
    note: 'Old-listing warnings come from data the app actually stores, not from guessing the employer’s intent.',
  },
  evaluate: {
    title: 'A score with reasons you can check',
    lead: 'An evaluation compares the chosen CV with one job posting and gives a result you can trace back, not a bare number.',
    steps: [
      { title: 'Pick a CV and a posting', body: 'Start an evaluation from search results. The app remembers which CV was used with which posting.' },
      { title: 'AI reads and scores', body: 'You get an AI fit of x / 5 with a report that checks each requirement against evidence from your CV.' },
      { title: 'Skills found are counted separately', body: 'Skills found (n of m) are counted from keywords without AI and shown apart from the AI score.' },
      { title: 'Open the evidence', body: 'See the evidence behind each point, so you know where the strengths and gaps are.' },
    ],
    good: ['An evaluation takes a couple of minutes.', 'It uses AI, so an AI provider must be set up first.'],
    note: 'The score is an AI estimate to help you decide. It does not predict whether you will get the job.',
  },
  draft: {
    title: 'Draft a tailored CV and cover letter',
    lead: 'Let the agent tailor your CV and draft letters for a posting, using only what you really have.',
    steps: [
      { title: 'Choose what to draft', body: 'A cover letter, an application message, or a CV tailored to the job. You choose the document language.' },
      { title: 'Choose a CV mode', body: 'Automatic: the agent tailors and saves a new version straight away. Manual: you say what to change and how much, then pick proposals before saving.' },
      { title: 'The evidence gate stops overclaiming', body: 'A proposal that cites something not in your experience bank is blocked and cannot be picked.' },
      { title: 'Review before any use', body: 'Each document is kept as a version. You open it and decide whether to use it.' },
    ],
    good: ['If a job needs a skill you do not have, the app will not add it. It tells you to add that skill once you really have it.', 'The app never submits an application for you.'],
    note: 'Nothing is guessed or invented. Every line in a tailored CV must trace back to a fact in your experience bank.',
  },
  connect: {
    title: 'Connect the agent you already use',
    lead: 'Let an external AI assistant help inside your project, while you control its permissions and approve risky work.',
    steps: [
      { title: 'Open the connect page', body: 'On the agent activity page, the "Connect" tab shows the MCP, agent card and A2A addresses with a setup example.' },
      { title: 'Grant only what is needed', body: 'The agent asks for permissions on a consent page. You see what it asks, for which project, and you allow or deny.' },
      { title: 'See everything the agent does', body: 'Every job the agent runs shows on the activity page, with its steps and status.' },
      { title: 'Approve or revoke at any time', body: 'Risky work waits for your approval, and you can revoke an agent’s access from the account page.' },
    ],
    good: ['Permissions that write data are opt-in, one by one.', 'Each project’s data is separate. An agent reaches only the projects you allow.'],
    note: 'Job postings and documents an agent reads are untrusted data. They cannot change your permissions or settings.',
  },
};

export const featurePages: Record<'th' | 'en', Pages> = { th, en };
