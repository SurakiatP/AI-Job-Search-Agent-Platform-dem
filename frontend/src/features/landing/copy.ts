const th = {
  headlineA: 'ให้ AI เทียบ CV กับงาน',
  headlineB: 'แล้วบอกเหตุผลให้คุณ',
  // source: PRODUCT.md (fit score 0-100% with reasons, tailored drafts, user checks and submits); DESIGN.md (FitScore shows a percentage)
  sub: 'ใส่ CV กับประกาศงาน แล้วรับคะแนนความเหมาะสม 0-100% พร้อมเหตุผล และร่าง CV กับจดหมายสมัครงานที่ปรับตามตำแหน่ง คุณตรวจทุกฉบับและสมัครเอง',
  cta: 'สร้างบัญชี',
  signup: 'เริ่มใช้งาน',
  login: 'เข้าสู่ระบบ',
  openApp: 'เปิดแอป',
  docs: 'คู่มือ',
  nav: { label: 'เมนูหลัก', menu: 'เมนู', features: 'ฟีเจอร์', how: 'วิธีทำงาน', data: 'ข้อมูลและการเชื่อมต่อ', learnMore: 'ดูว่าทำงานอย่างไร' },
  secondary: 'ดูว่าแต่ละส่วนทำอะไร',
  // source: PRODUCT.md (AI-assisted evaluation and preparation; user decides and submits)
  tagline: ['AI ช่วยอ่าน เทียบ และร่างให้', 'ส่วนการตัดสินใจและการกดสมัครเป็นของคุณ'] as [string, string],
  noSubmit: 'ไม่ส่งใบสมัครอัตโนมัติ คุณตรวจเองและสมัครเองทุกครั้ง',
  demo: {
    label: 'ตัวอย่างประกอบ · ข้อมูลสาธิต',
    title: 'Senior Data Analyst',
    company: 'บริษัทตัวอย่าง จำกัด',
    list: 'เส้นทางของงานนี้',
    progress: 'ขั้นที่ 4 จาก 5',
    steps: [
      { stage: 'cv', title: 'CV ผู้วิเคราะห์ข้อมูล (v4) พร้อมใช้', note: 'เก็บไว้พร้อมไฟล์ต้นฉบับ', state: 'done' },
      { stage: 'search', title: 'บันทึกงานนี้จากการค้นหา', note: 'อยู่ในโปรเจกต์ของคุณแล้ว', state: 'done' },
      { stage: 'evaluate', title: 'ประเมินความเหมาะสม', note: 'พบทักษะ 8 จาก 11 นับจากคำสำคัญ ไม่ใช้ AI', state: 'done' },
      { stage: 'docs', title: 'ปรับ CV และร่างจดหมายสมัครงานแล้ว', note: 'รอคุณตรวจการแก้ CV', state: 'current' },
      { stage: 'track', title: 'ติดตามใบสมัคร', note: 'คุณสมัครเอง แล้วบันทึกสถานะที่นี่', state: 'next' },
    ],
    score: '84%',
    ai: 'AI',
  },
  stepsTitle: 'เริ่มได้ในสามขั้น',
  how: [
    // source: faq[4] and steps[1] (CV builder form, api/resume.py builder create); upload accepts PDF, DOCX or text
    { title: 'เพิ่ม CV ของคุณ', body: 'อัปโหลดไฟล์ CV (PDF, DOCX หรือข้อความ) หรือสร้าง CV ในแอปด้วยแบบฟอร์ม CV อยู่ในโปรเจกต์ของคุณ' },
    { title: 'ค้นหาและประเมินงาน', body: 'ค้นประกาศงานจริงในไทย ฟีเจอร์ AI ใช้ได้เมื่อผู้ดูแลระบบเปิดใช้ AI แล้ว' },
    { title: 'ตรวจและติดตามการสมัคร', body: 'ตรวจเอกสารที่ร่างไว้ แล้วบันทึกความคืบหน้าการสมัครของคุณเอง' },
  ],
  tourTitle: 'แต่ละส่วนของแอปทำอะไร',
  tourLabel: 'ขั้นตอนการใช้งาน',
  steps: [
    { tab: 'ใส่ CV', eyebrow: 'ใส่ CV ครั้งเดียว', title: 'แนบ CV ครั้งเดียว ใช้ได้กับทุกงาน', body: 'อัปโหลด CV แล้วแอปอ่านทักษะให้ และให้ AI ดึงประสบการณ์เป็นข้อเท็จจริงที่คุณตรวจได้ CV ต้นฉบับของคุณจะไม่ถูกแก้ไข' },
    { tab: 'สร้าง CV', eyebrow: 'ไม่มีไฟล์ก็เริ่มได้', title: 'สร้าง CV ในแอปด้วยแบบฟอร์ม', body: 'กรอกแบบฟอร์ม เลือกเทมเพลตและสีเน้น แล้วดู PDF จริงระหว่างแก้ไข เมื่อพอใจก็บันทึกเป็นเวอร์ชันและใช้ประเมินงานต่อได้' },
    { tab: 'ค้นหางาน', eyebrow: 'ค้นหางานจริงในไทย', title: 'ค้นประกาศงานจริงในไทย', body: 'ค้นหาประกาศงานจริง ดูอายุประกาศ รับคำเตือนเมื่อเป็นประกาศเก่าที่อาจปิดรับแล้ว และเปิดประกาศต้นฉบับได้ ส่วนการจับคู่ด้วย AI ช่วยเรียงงานที่เหมาะกับ CV ของคุณ' },
    { tab: 'ประเมิน', eyebrow: 'ประเมินด้วย AI + ทักษะ', title: 'คะแนนที่มีเหตุผลให้ตรวจ', body: 'AI อ่านประกาศเทียบกับ CV แล้วให้คะแนนพร้อมเหตุผล ส่วนทักษะที่ตรงคำนวณจากคำสำคัญโดยไม่ใช้ AI และแยกจากคะแนนอย่างชัดเจน' },
    { tab: 'ซ้อมสัมภาษณ์', eyebrow: 'ซ้อมกับงานที่ประเมินแล้ว', title: 'ซ้อมสัมภาษณ์ให้ตรงกับงานนั้น', body: 'สร้างชุดคำถามจาก CV คลังประสบการณ์ และประกาศงาน ซ้อมตอบ ทบทวนด้วยแฟลชการ์ด และขอความเห็นจาก AI ไม่มีการทำนายโอกาสได้งาน' },
    { tab: 'ร่างเอกสาร', eyebrow: 'ร่างเอกสารที่ปรับแล้ว', title: 'ร่าง CV และ Cover letter ตามตำแหน่ง', body: 'ได้ฉบับร่างที่ปรับตามประกาศ แยกเวอร์ชัน ให้คุณตรวจก่อนใช้ และไม่ส่งใบสมัครแทนคุณ' },
    { tab: 'ติดตามสมัคร', eyebrow: 'ติดตามใบสมัครของคุณ', title: 'ติดตามทุกใบสมัครไว้ที่เดียว', body: 'ย้ายงานระหว่างสถานะบนบอร์ด เก็บผู้ติดต่อ โน้ต และบันทึกอีเมลของแต่ละงาน การเปลี่ยนสถานะเป็นเพียงบันทึกของคุณ ไม่ได้ส่งใบสมัคร' },
    { tab: 'แจ้งเตือนงาน', eyebrow: 'รับสรุปงานใหม่', title: 'รับสรุปงานใหม่ที่ตรงกับการค้นหา', body: 'บันทึกการค้นหาไว้ แล้วรับสรุปงานใหม่ทุกวันหรือทุกสัปดาห์ทางอีเมล Telegram หรือ webhook ส่วนสรุปนี้ไม่ใช้ AI' },
    { tab: 'เชื่อมผู้ช่วย', eyebrow: 'เชื่อมผู้ช่วย AI ของคุณ', title: 'ต่อกับผู้ช่วยที่คุณใช้อยู่', body: 'เชื่อมผู้ช่วย AI ที่คุณใช้อยู่ให้ช่วยงานในโปรเจกต์ของคุณ งานทุกชิ้นแสดงในหน้ากิจกรรม และงานเสี่ยงต้องรอคุณอนุมัติ ปิดไว้เป็นค่าเริ่มต้น' },
  ],
  panel: {
    sample: 'ตัวอย่าง',
    labels: ['CV ของคุณ', 'ตัวอย่าง CV', 'ค้นหางาน', 'ผลประเมิน', 'ชุดซ้อมสัมภาษณ์', 'เอกสาร', 'บอร์ดติดตาม', 'การค้นหาที่บันทึก', 'ผู้ช่วยที่เชื่อมต่อ'],
    cvMeta: 'อ่านข้อความแล้ว · 2 หน้า',
    ready: 'พร้อมใช้',
    parsed: 'ทักษะที่อ่านได้จาก CV',
    skills: ['React', 'TypeScript', 'Tailwind', 'Git', 'REST', 'Vite'],
    searchValue: 'Frontend Developer',
    searchLabel: 'คำค้นหา',
    letterTitle: 'Cover letter · Frontend Developer',
    letterRev: 'ฉบับที่ 1',
    letterGreeting: 'เรียน ฝ่ายทรัพยากรบุคคล',
    build: { tpl: 'เทมเพลต', accent: 'สีเน้น', preview: 'พรีวิว PDF', saved: 'บันทึกแล้ว', name: 'ชื่อ-นามสกุล', headline: 'นักวิเคราะห์ข้อมูล', sections: ['ประสบการณ์ทำงาน', 'การศึกษา', 'ทักษะ'] },
    practice: { section: 'ประสบการณ์ที่ผ่านมา (STAR)', question: 'เล่าถึงครั้งที่คุณต้องส่งงานภายใต้เส้นตายที่กระชั้น', star: [['S', 'สถานการณ์', true], ['T', 'หน้าที่', true], ['A', 'สิ่งที่ทำ', true], ['R', 'ผลลัพธ์', false]] as [string, string, boolean][], missing: 'ยังไม่พบ', feedback: 'ความเห็นจาก AI', dims: [['โครงเรื่อง', 4], ['ตรงกับงาน', 4], ['มีหลักฐาน', 3]] as [string, number][], of: 'จาก 5', toAdd: 'สิ่งที่ควรเพิ่ม: ตัวเลขผลลัพธ์ที่วัดได้', cards: 'แฟลชการ์ด 12 ใบ · จำได้ 7 ใบ' },
    track: { head: 'ติดตามแล้ว 3 งาน', rows: [['Frontend Developer', 'บริษัทตัวอย่าง จำกัด', 'interview', 'เตรียมตัวและบันทึกผล'], ['Data Analyst', 'บริษัทตัวอย่าง จำกัด', 'applied', 'บันทึกคำตอบเมื่อได้รับ'], ['Full-stack Engineer', 'บริษัทตัวอย่าง จำกัด', 'saved', 'ประเมินงานนี้']] as [string, string, 'interview' | 'applied' | 'saved', string][], note: 'การเปลี่ยนสถานะไม่ส่งใบสมัคร' },
    alerts: { name: 'Frontend Developer · กรุงเทพฯ', freq: 'ทุกวัน 08:00 น.', next: 'สรุปถัดไป: พรุ่งนี้ 08:00 น.', channels: [['อีเมล', true], ['Telegram', true], ['Webhook', false]] as [string, boolean][], on: 'เปิด', off: 'ปิด', preview: 'ส่งตัวอย่าง' },
  },
  diffTitle: 'ข้อมูลของคุณไปที่ไหน และใครทำอะไรได้',
  local: {
    title: 'พื้นที่ทำงานและ AI ของคุณ',
    // source: previous local.body (owner-approved) and PRODUCT.md (project isolation)
    body: 'แต่ละโปรเจกต์เก็บ CV งาน เอกสาร และกิจกรรมของตัวเอง เมื่อใช้ฟีเจอร์ AI ระบบอาจส่งข้อความจาก CV เท่าที่จำเป็นไปยังบริการ AI ภายนอก',
    rows: ['ข้อมูลแต่ละโปรเจกต์แยกจากกัน', 'ใช้ AI ช่วยประเมินและร่างเอกสาร', 'ข้อมูล CV ที่จำเป็นอาจถูกส่งไปยังบริการ AI'],
    submit: 'ส่งใบสมัคร',
    submitNote: 'ไม่ส่งแทนคุณ',
  },
  agent: {
    flow: 'ขั้นตอนเมื่อผู้ช่วยที่เชื่อมต่อขออนุมัติ',
    title: 'เชื่อมกับผู้ช่วยที่คุณใช้อยู่ได้',
    body: 'เปิดให้ผู้ช่วย AI ของคุณทำงานแทนในขอบเขตที่คุณกำหนดและเพิกถอนได้ งานเสี่ยงต้องรอคุณอนุมัติ ปิดไว้เป็นค่าเริ่มต้น',
    token: 'my-agent',
    scopes: 'อ่านผลลัพธ์ · ประเมินงาน',
    revoke: 'เพิกถอน',
    // source: features/console/copy.ts actions.submit_application (the real approval label)
    request: 'ขออนุมัติ: บันทึกว่าสมัครงานแล้ว · Full-stack Engineer',
    approve: 'อนุมัติ',
    reject: 'ปฏิเสธ',
  },
  faqTitle: 'คำถามที่ควรถามก่อนเริ่ม',
  faq: [
    // source: PRODUCT.md line 28 (users submit applications themselves; Applied is a tracking action)
    { q: 'ระบบส่งใบสมัครให้ฉันไหม', a: 'ไม่ส่ง คุณสมัครเองบนเว็บของนายจ้างหรือช่องทางที่คุณเลือก แล้วกลับมาบันทึกสถานะไว้ในแอป การเปลี่ยนสถานะเป็นบันทึกของคุณเท่านั้น' },
    // source: steps[3].body / steps[7].body (keyword skills and digests do not use AI; verified backend skill_coverage.py has no model, saved_searches.py digests import only mailer/telegram/webhooks) and local.body
    { q: 'ข้อมูล CV ของฉันไปที่ไหน', a: 'CV และงานอยู่ในโปรเจกต์ของคุณ เมื่อใช้ฟีเจอร์ AI ระบบอาจส่งข้อความจาก CV เท่าที่ฟีเจอร์นั้นต้องใช้ไปยังบริการ AI ภายนอก การนับทักษะจากคำสำคัญและสรุปงานใหม่ไม่ใช้ AI' },
    // source: PRODUCT.md line 20 (no hiring probability), steps[3].body (skills from keywords, kept apart from score)
    { q: 'คะแนน 84% หมายถึงอะไร', a: 'เป็นคะแนนความเหมาะสมที่ AI ให้พร้อมเหตุผลให้คุณตรวจ ไม่ใช่โอกาสได้งาน และแยกจากจำนวนทักษะที่ตรงซึ่งนับจากคำสำคัญ' },
    // source: PRODUCT.md line 25 (immutable CV revisions bound to job revision in a session)
    { q: 'ถ้าอัปโหลด CV ใหม่ ผลประเมินเก่าจะเปลี่ยนไหม', a: 'ไม่เปลี่ยน ผลประเมินแต่ละครั้งบอกว่าใช้ CV ฉบับไหนกับประกาศฉบับไหน CV ใหม่จะเป็นฉบับใหม่ ส่วนฉบับเดิมยังอยู่' },
    // source: steps[1].body (build CV with form, template, accent, save as version)
    { q: 'ไม่มีไฟล์ CV เริ่มได้ไหม', a: 'ได้ สร้าง CV ในแอปด้วยแบบฟอร์ม เลือกเทมเพลตและสีเน้น แล้วบันทึกเป็นเวอร์ชันเพื่อใช้ประเมินงาน' },
    // source: steps[8].body, agent.body and services/approvals.py (opt-in submit autopilot auto-approves; off by default) (limits, revoke, approval, activity page); connection exists only when the user issues access
    { q: 'ใช้กับผู้ช่วย AI ที่ฉันใช้อยู่ได้ไหม', a: 'ได้ ปิดไว้เป็นค่าเริ่มต้น คุณกำหนดขอบเขตและเพิกถอนได้ งานเสี่ยงต้องรอคุณอนุมัติ เว้นแต่คุณเปิดอนุมัติอัตโนมัติเอง และทุกงานแสดงในหน้ากิจกรรม' },
  ],
  // source: landing steps (add CV, search or add job posting, evaluate)
  closing: 'เริ่มจาก CV หนึ่งไฟล์กับงานหนึ่งตำแหน่ง',
  closingSub: 'สร้างบัญชี ใส่ CV แล้วเลือกงานจากการค้นหาหรือเพิ่มงานเอง จากนั้นเริ่มประเมินงานแรก',
  footer: { label: 'ลิงก์ท้ายหน้า' },
  controlTitle: 'สิ่งที่อยู่ในมือคุณเสมอ',
  control: ['คุณตรวจทุกอย่างก่อนนำไปใช้', 'คุณสมัครเอง ระบบไม่ส่งแทน', 'ข้อมูลแต่ละโปรเจกต์แยกกัน'],
};

const en: typeof th = {
  headlineA: 'Let AI match your CV to the job,',
  headlineB: 'and tell you why',
  sub: 'Add your CV and a job posting. Get a fit score from 0 to 100% with reasons, plus a CV and cover letter drafted for that role. You check every draft and apply yourself.',
  cta: 'Create account',
  signup: 'Get started',
  login: 'Log in',
  openApp: 'Open app',
  docs: 'Docs',
  nav: { label: 'Main menu', menu: 'Menu', features: 'Features', how: 'How it works', data: 'Data & connections', learnMore: 'See how it works' },
  secondary: 'See what each part does',
  tagline: ['The AI reads, compares and drafts.', 'Deciding and applying stay with you.'],
  noSubmit: 'No automatic submission. You review everything and apply yourself.',
  demo: {
    label: 'Illustrative demo · Sample data',
    title: 'Senior Data Analyst',
    company: 'Sample Company Ltd.',
    list: 'Journey of this job',
    progress: 'Step 4 of 5',
    steps: [
      { stage: 'cv', title: 'Data Analyst CV (v4) is ready', note: 'Kept with its original file', state: 'done' },
      { stage: 'search', title: 'Saved this job from your search', note: 'It is in your project now', state: 'done' },
      { stage: 'evaluate', title: 'Fit evaluation', note: 'Skills found: 8 of 11, counted from keywords, no AI', state: 'done' },
      { stage: 'docs', title: 'CV changes and letter drafted', note: 'Waiting for you to review the CV changes', state: 'current' },
      { stage: 'track', title: 'Track your application', note: 'You apply yourself, then record the status here', state: 'next' },
    ],
    score: '84%',
    ai: 'AI',
  },
  stepsTitle: 'Three steps to start',
  how: [
    // source: faq[4] and steps[1] (CV builder form, api/resume.py builder create); upload accepts PDF, DOCX or text
    { title: 'Add your CV', body: 'Upload a CV file (PDF, DOCX or text) or build one in the app with a form. It stays in your project.' },
    { title: 'Find and evaluate jobs', body: 'Search real jobs in Thailand. AI features work once your administrator has set up AI.' },
    { title: 'Review and track', body: 'Review the drafted documents, then record your own application progress.' },
  ],
  tourTitle: 'What each part of the app does',
  tourLabel: 'Steps',
  steps: [
    { tab: 'Add CV', eyebrow: 'Add your CV once', title: 'Attach your CV once, use it for every job', body: 'Upload a CV and the app reads your skills; AI can then pull your experience into facts you check. Your original CV is never edited.' },
    { tab: 'Build CV', eyebrow: 'No file? Start here', title: 'Build a CV in the app with a form', body: 'Fill in a form, pick a template and accent colour, and see the real PDF while you edit. When you are happy, save it as a version and use it to evaluate jobs.' },
    { tab: 'Search', eyebrow: 'Find real jobs in Thailand', title: 'Search real listings in Thailand', body: 'Search real job postings, see how old each one is, get warned when a listing looks stale, and open the original. AI matching ranks the jobs that fit your CV.' },
    { tab: 'Evaluate', eyebrow: 'Evaluate with AI + skills', title: 'A score with reasons you can check', body: 'The AI reads the posting against your CV and scores it with reasons. Matched skills are counted from keywords, without AI, and kept apart from the score.' },
    { tab: 'Interview practice', eyebrow: 'Practise for evaluated jobs', title: 'Practise for the interview at that job', body: 'Create a question set from your CV, experience bank and the posting. Practise answers, review with flashcards and get AI feedback. It never predicts your chances.' },
    { tab: 'Draft', eyebrow: 'Draft tailored documents', title: 'A CV and cover letter for the role', body: 'Get drafts tailored to the posting, versioned, for you to review before use. The app never submits an application for you.' },
    { tab: 'Track', eyebrow: 'Track your applications', title: 'Track every application in one place', body: 'Move jobs between stages on a board and keep contacts, notes and logged emails per job. Changing a stage only records your tracking. It submits nothing.' },
    { tab: 'Job alerts', eyebrow: 'Get digests of new jobs', title: 'Get new jobs that match a saved search', body: 'Save a search and receive new matches daily or weekly by email, Telegram or webhook. These digests do not use AI.' },
    { tab: 'Connect', eyebrow: 'Connect your assistant', title: 'Plug in the assistant you already use', body: 'Let the AI assistant you already use help in your projects. Every task shows in the activity page and risky ones wait for your approval. Off by default.' },
  ],
  panel: {
    sample: 'Sample',
    labels: ['Your CV', 'CV builder', 'Job search', 'Evaluation', 'Practice set', 'Documents', 'Applications board', 'Saved search', 'Connected assistants'],
    cvMeta: 'Text read · 2 pages',
    ready: 'Ready',
    parsed: 'Skills read from your CV',
    skills: ['React', 'TypeScript', 'Tailwind', 'Git', 'REST', 'Vite'],
    searchValue: 'Frontend Developer',
    searchLabel: 'Search',
    letterTitle: 'Cover letter · Frontend Developer',
    letterRev: 'Version 1',
    letterGreeting: 'Dear Hiring Manager,',
    build: { tpl: 'Template', accent: 'Accent', preview: 'PDF preview', saved: 'Saved', name: 'Full name', headline: 'Data Analyst', sections: ['Experience', 'Education', 'Skills'] },
    practice: { section: 'Past experience (STAR)', question: 'Tell me about a time you delivered under a tight deadline.', star: [['S', 'Situation', true], ['T', 'Task', true], ['A', 'Action', true], ['R', 'Result', false]] as [string, string, boolean][], missing: 'not found', feedback: 'AI feedback', dims: [['Structure', 4], ['Relevance', 4], ['Evidence', 3]] as [string, number][], of: 'of 5', toAdd: 'What to add: a measurable result', cards: '12 flashcards · 7 known' },
    track: { head: '3 jobs tracked', rows: [['Frontend Developer', 'Sample Company Ltd.', 'interview', 'Prepare and log the outcome'], ['Data Analyst', 'Sample Company Ltd.', 'applied', 'Log a reply when you get one'], ['Full-stack Engineer', 'Sample Company Ltd.', 'saved', 'Evaluate this job']] as [string, string, 'interview' | 'applied' | 'saved', string][], note: 'Changing a stage does not send an application' },
    alerts: { name: 'Frontend Developer · Bangkok', freq: 'Daily at 08:00', next: 'Next digest: tomorrow 08:00', channels: [['Email', true], ['Telegram', true], ['Webhook', false]] as [string, boolean][], on: 'On', off: 'Off', preview: 'Send preview' },
  },
  diffTitle: 'Where your data goes, and who can act on it',
  local: {
    title: 'Your workspace and AI',
    body: 'Each project keeps its own CVs, jobs, documents and activity. When you use an AI feature, the CV text that feature needs may be sent to an external AI service.',
    rows: ['Each project keeps its own data', 'AI helps evaluate and draft documents', 'Required CV content may be sent to an AI service'],
    submit: 'Submit application',
    submitNote: 'Never done for you',
  },
  agent: {
    flow: 'How a connected assistant asks',
    title: 'Connects to the assistant you already use',
    body: 'Let your own AI assistant work for you within limits you set and can revoke. Risky actions wait for your approval. Off by default.',
    token: 'my-agent',
    scopes: 'Read results · Evaluate',
    revoke: 'Revoke',
    // source: features/console/copy.ts actions.submit_application (the real approval label)
    request: 'Approval needed: Record this job as applied · Full-stack Engineer',
    approve: 'Approve',
    reject: 'Reject',
  },
  faqTitle: 'Questions worth asking first',
  faq: [
    { q: 'Does the app submit applications for me?', a: 'No. You apply yourself on the employer\'s site or your own channel, then record the status here. Changing a status is only your record.' },
    { q: 'Where does my CV go?', a: 'Your CV and jobs stay in your project. When you use an AI feature, the CV text that feature needs may be sent to an external AI service. Keyword skill counts and digests of new jobs do not use AI.' },
    { q: 'What does a score of 84% mean?', a: 'It is the fit score, worked out by a written formula from the AI\'s judgment of each requirement, with reasons for you to check. It is not a chance of being hired, and it is kept apart from the count of matched skills, which comes from keywords.' },
    { q: 'If I upload a new CV, do old evaluations change?', a: 'No. Each evaluation names the CV version and job version it used. A new CV becomes a new version and the old one stays.' },
    { q: 'Can I start without a CV file?', a: 'Yes. Build a CV in the app with a form, choose a template and accent colour, and save it as a version to evaluate jobs.' },
    { q: 'Can I connect the AI assistant I already use?', a: 'Yes. It is off by default. You set its limits and can revoke it, risky actions wait for your approval unless you turn on auto-approve yourself, and every task shows in the activity page.' },
  ],
  closing: 'Start with one CV and one job',
  closingSub: 'Create an account, add your CV, pick a job from search or add one yourself, then run your first evaluation.',
  footer: { label: 'Footer links' },
  controlTitle: 'What stays in your control',
  control: ['You review everything before it is used', 'You apply yourself; the app never submits', 'Each project keeps its own data'],
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
      { op: 'ประเมินงาน', job: 'Frontend Developer', status: 'completed', score: 84, origin: 'ผู้ช่วย AI' },
    ],
  },
  en: {
    job: 'Frontend Developer · Sample Company Ltd.',
    reasons: ['React and TypeScript skills match the posting', '3 years of experience as requested', 'No automated-testing experience yet'],
    docs: [{ name: 'CV tailored for the role', rev: 'Version 2' }, { name: 'Cover letter', rev: 'Version 1' }],
    download: 'Download',
    evaluate: 'Evaluate job',
    staleLabel: 'Stale listing',
    jobs: [
      { title: 'Frontend Developer', company: 'Sample Company Ltd.', place: 'Bangkok', mode: 'Hybrid', age: 'Posted 3 days ago', stale: false, skills: ['React', 'TypeScript'], blurb: 'Build the product web UI with the design and backend teams.' },
      { title: 'Data Analyst', company: 'Sample Company Ltd.', place: 'Bangkok', mode: 'On-site', age: 'Posted 52 days ago', stale: true, skills: ['SQL'], blurb: 'Analyse data and prepare reports for business teams.' },
    ],
    consoleLabel: 'Agent tasks',
    runs: [
      { op: 'Evaluate job', job: 'Frontend Developer', status: 'completed', score: 84, origin: 'AI assistant' },
    ],
  },
};
