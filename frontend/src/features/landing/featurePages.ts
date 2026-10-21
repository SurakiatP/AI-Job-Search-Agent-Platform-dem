// One explainer page per product feature, in the same order as the landing tour (copy.ts `steps`).
export const featureSlugs = ['add-cv', 'build-cv', 'search', 'evaluate', 'practice', 'draft', 'track', 'alerts', 'connect'] as const;
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
  'build-cv': {
    title: 'ไม่มี CV? สร้างในแอปได้เลย',
    lead: 'กรอกแบบฟอร์ม เลือกเทมเพลต แล้วดู PDF จริงระหว่างแก้ไข ไม่ต้องมีไฟล์มาก่อน',
    steps: [
      { title: 'เริ่มจากฟอร์ม', body: 'ตั้งชื่อ CV แล้วเริ่มจากข้อมูลในคลังประสบการณ์ถ้ามี หรือเริ่มจากหน้าว่าง' },
      { title: 'เลือกเทมเพลตและสีเน้น', body: 'มีเทมเพลต 6 แบบและสีเน้น 6 สี เทมเพลตสองคอลัมน์จะมีคำเตือนเรื่องระบบคัดกรองใบสมัคร (ATS)' },
      { title: 'จัดหัวข้อตามที่ต้องการ', body: 'เปิดหรือซ่อนหัวข้อ เรียงลำดับใหม่ได้ เทมเพลต Lotus, Teak และ Saffron ใส่รูปถ่ายได้' },
      { title: 'ดูตัวอย่าง PDF แล้วบันทึกเป็นเวอร์ชัน', body: 'ร่างบันทึกอัตโนมัติ เมื่อพอใจให้บันทึกเป็นเวอร์ชันใหม่ ใช้ประเมินงานได้ทันที' },
    ],
    good: ['เลือกภาษาของ CV ได้ ไทยหรืออังกฤษ', 'ข้อมูลบุคคลอ้างอิงเป็นข้อมูลของผู้อื่น แอปไม่ส่งให้ AI'],
    note: 'ขั้นตอนสร้างและแก้ CV ในฟอร์มเป็นการทำเอง ไม่ใช้ AI ส่วนการปรับ CV ให้ตรงตำแหน่งอยู่ในขั้นร่างเอกสาร',
  },
  search: {
    title: 'ค้นประกาศงานจริงในไทย',
    lead: 'ค้นหางานจากประกาศจริง ดูว่าประกาศอายุเท่าไหร่ และรู้ก่อนว่าประกาศไหนอาจปิดรับแล้ว',
    steps: [
      { title: 'ค้นด้วยคำสำคัญและตัวกรอง', body: 'ค้นด้วยตำแหน่ง บริษัท หรือทักษะ แล้วกรองตามสถานที่ รูปแบบการทำงาน และตัวกรองเพิ่มเติม' },
      { title: 'ดูอายุประกาศและคำเตือน', body: 'ทุกผลลัพธ์บอกอายุประกาศ ถ้าอาจเป็นประกาศเก่า จะบอกเหตุผล เช่น ลงมานานแล้ว หรือไม่พบในแหล่งงานตอนตรวจล่าสุด' },
      { title: 'จัดอันดับด้วย Smart match', body: 'กดเริ่มเอง แล้ว AI จัดอันดับงานตาม CV ของคุณ ผลลัพธ์แสดงความเหมาะสม x / 5 และทักษะที่พบแยกกัน พร้อมบรรทัดใน CV ที่เป็นหลักฐานของทักษะ เมื่อพบ' },
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
  practice: {
    title: 'ซ้อมสัมภาษณ์ให้ตรงกับงานนั้น',
    lead: 'สร้างชุดคำถามจากการประเมินงาน ซ้อมตอบ ทบทวนด้วยแฟลชการ์ด และขอความเห็นจาก AI',
    steps: [
      { title: 'สร้างชุดซ้อมจากการประเมิน', body: 'เปิดการประเมินงาน เลือกระดับ ส่วนที่จะซ้อม และจำนวนคำถาม รวมไม่เกิน 30 ข้อ' },
      { title: 'คำถามตั้งจากข้อมูลของคุณ', body: 'AI เขียนคำถามจาก CV คลังประสบการณ์ และประกาศงานนั้น เช่น เล่าประสบการณ์ (STAR) สถานการณ์สมมติ และจุดที่ CV ยังขาด' },
      { title: 'ซ้อมตอบและขอความเห็น', body: 'พิมพ์คำตอบ แล้วให้ AI ให้คะแนน 1 ถึง 5 ตามโครงเรื่อง ความตรงกับงาน หลักฐาน ความชัดเจน และความเข้ากับบริษัท' },
      { title: 'ทบทวนความรู้ด้วยแฟลชการ์ด', body: 'พลิกการ์ด ตอบก่อนพลิกแล้วให้ตรวจ หรือทำเครื่องหมายว่าจำได้แล้ว/ยังไม่แม่น แล้วกลับมาทบทวนเฉพาะใบที่ยังไม่แม่น' },
      { title: 'สรุปผลและแผนเตรียมตัว', body: 'AI สรุปจุดแข็ง ทักษะที่ควรเพิ่ม และแผน จากคำตอบในชุดนั้น' },
    ],
    good: ['คำตอบตัวอย่างใช้เฉพาะข้อเท็จจริงในคลังประสบการณ์ของคุณ ถ้ายังไม่พอ แอปจะบอกว่าไม่มีคำตอบตัวอย่าง', 'สร้างชุดซ้อมใช้โควตา 60 ครั้งต่อวัน และเก็บได้สูงสุด 20 ชุด'],
    note: 'ความเห็นและสรุปเป็นค่าประมาณจาก AI ใช้ฝึกตัว ไม่ได้ทำนายโอกาสได้งาน และต้องตั้งค่าผู้ให้บริการ AI ก่อน',
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
  track: {
    title: 'ติดตามทุกใบสมัครไว้ที่เดียว',
    lead: 'เก็บงานที่สมัครไว้บนบอร์ดเดียว พร้อมผลประเมิน เอกสาร และบันทึกการติดต่อของงานนั้น',
    steps: [
      { title: 'เพิ่มงานเข้ารายการ', body: 'บันทึกงานจากหน้าค้นหา หรือเพิ่มประกาศเองด้วยการวางรายละเอียดงาน' },
      { title: 'ย้ายสถานะ', body: 'ลากการ์ดบนบอร์ดหรือเลือกสถานะจากรายการ ตั้งแต่บันทึกไว้ สมัครแล้ว ตอบกลับ สัมภาษณ์ ไปจนถึงข้อเสนอ' },
      { title: 'เก็บบันทึกของแต่ละงาน', body: 'เก็บข้อมูลผู้ติดต่อฝ่ายสรรหา จดโน้ต และบันทึกอีเมลที่ส่งหรือได้รับ' },
      { title: 'ดูสิ่งที่ควรทำต่อ', body: 'แต่ละสถานะบอกขั้นถัดไป เช่น ประเมินงานนี้ หรือเตรียมตัวสัมภาษณ์' },
    ],
    good: ['การเปลี่ยนสถานะเป็นเพียงการบันทึกของคุณ ไม่ได้ส่งใบสมัคร', 'ปุ่มเขียนอีเมลเปิดแอปอีเมลของคุณเอง แพลตฟอร์มไม่ส่งอีเมลแทนคุณ'],
    note: 'คุณสมัครกับนายจ้างเองนอกแอป แล้วมาบันทึกความคืบหน้าที่นี่',
  },
  alerts: {
    title: 'รับสรุปงานใหม่ที่ตรงกับการค้นหา',
    lead: 'บันทึกการค้นหาไว้ แล้วรับสรุปงานใหม่ที่ตรงตัวกรองตามรอบที่เลือก',
    steps: [
      { title: 'ตั้งตัวกรองแล้วบันทึกการค้นหา', body: 'ตั้งคำค้นและตัวกรอง แล้วบันทึกเป็นการค้นหาที่ใช้ซ้ำ ได้สูงสุด 10 รายการต่อโปรเจกต์' },
      { title: 'เลือกรอบ', body: 'รับทุกวันเวลา 08:00 น. (เวลากรุงเทพฯ) หรือทุกสัปดาห์วันจันทร์' },
      { title: 'เลือกช่องทาง', body: 'อีเมล และ Telegram เมื่อระบบเปิดบอตไว้และคุณเชื่อมต่อบัญชีแล้ว หรือส่งไปยัง webhook ที่คุณตั้งไว้' },
      { title: 'ลองส่งตัวอย่าง', body: 'ส่งตัวอย่างสรุปให้ตัวเองก่อนได้ และปิดแต่ละช่องทางได้ทุกเมื่อ' },
    ],
    good: ['ต้องยืนยันอีเมลก่อนจึงรับสรุปทางอีเมลได้', 'สรุปงานนี้ไม่ใช้ AI และไม่เสียโควตา AI'],
    note: 'สรุปบอกว่ามีงานใหม่ที่ตรงตัวกรอง ไม่ได้ประเมินว่างานเหมาะกับคุณ ต้องกดประเมินเอง',
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
  'build-cv': {
    title: 'No CV yet? Build one in the app',
    lead: 'Fill in a form, pick a template and see the real PDF while you edit. No file needed to start.',
    steps: [
      { title: 'Start from a form', body: 'Name the CV and start from your experience bank if you have one, or from a blank page.' },
      { title: 'Pick a template and accent', body: 'Six templates and six accent colours. Two-column templates carry a warning about applicant tracking systems (ATS).' },
      { title: 'Arrange the sections', body: 'Show, hide and reorder sections. The Lotus, Teak and Saffron templates can include a photo.' },
      { title: 'Preview the PDF, then save a version', body: 'The draft saves as you type. When you are happy, save it as a new version and use it to evaluate jobs.' },
    ],
    good: ['Choose the CV language, Thai or English.', 'Reference details belong to other people, so the app never sends them to AI.'],
    note: 'Building and editing a CV in the form is manual and uses no AI. Tailoring a CV to a role happens in the drafting step.',
  },
  search: {
    title: 'Search real jobs in Thailand',
    lead: 'Search real postings, see how old each one is, and know in advance which ones may already be closed.',
    steps: [
      { title: 'Search with keywords and filters', body: 'Search by role, company or skill, then filter by location, work mode and more filters.' },
      { title: 'See the age and the warning', body: 'Every result shows its age. If it may be old, you get the reason, such as posted long ago or not found on the source at the last check.' },
      { title: 'Rank with Smart match', body: 'You press start, then AI ranks the jobs against your CV. AI fit (x / 5) and skills found are shown separately, with the CV line that backs a skill where one is found.' },
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
  practice: {
    title: 'Practise for the interview at this job',
    lead: 'Create a question set from a job evaluation, practise answering, review with flashcards and get AI feedback.',
    steps: [
      { title: 'Create a set from an evaluation', body: 'Open a job evaluation, choose a level, the sections to practise and how many questions, up to 30 in all.' },
      { title: 'Questions come from your own material', body: 'AI writes questions from your CV, experience bank and that posting: past experience (STAR), situational questions and the gaps in your CV.' },
      { title: 'Answer and get feedback', body: 'Type an answer and ask AI to score it from 1 to 5 on structure, relevance, evidence, clarity and company fit.' },
      { title: 'Review knowledge with flashcards', body: 'Flip a card, answer before flipping and have it checked, or mark cards known or still learning and revisit only those.' },
      { title: 'A summary and a plan', body: 'AI sums up strengths, skills to build and a preparation plan from the answers in that set.' },
    ],
    good: ['Example answers use only facts from your experience bank. When there is not enough, the app says there is no example.', 'A set uses 1 of 60 practice runs a day, and a session keeps up to 20 sets.'],
    note: 'Feedback and summaries are AI estimates for practice. They never predict your chances, and an AI provider must be set up first.',
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
  track: {
    title: 'Track every application in one place',
    lead: 'Keep the jobs you apply to on one board, with the evaluation, documents and contact notes for each.',
    steps: [
      { title: 'Add a job to the list', body: 'Save a job from search, or add a posting yourself by pasting the job description.' },
      { title: 'Move it between stages', body: 'Drag a card on the board or pick a stage from the list: saved, applied, responded, interview, offer and on.' },
      { title: 'Keep notes per job', body: 'Save the recruiter contact, jot notes and log emails you sent or received.' },
      { title: 'See what to do next', body: 'Each stage suggests a next step, such as evaluating the job or preparing for the interview.' },
    ],
    good: ['Changing a stage only records your tracking. It does not submit an application.', 'Write email opens your own mail app. The platform does not send email for you.'],
    note: 'You apply to the employer yourself, outside the app, then record progress here.',
  },
  alerts: {
    title: 'Get new jobs that match a saved search',
    lead: 'Save a search and receive the new jobs that match its filters on the schedule you choose.',
    steps: [
      { title: 'Set filters and save the search', body: 'Set a query and filters, then save it to reuse. Up to 10 saved searches per project.' },
      { title: 'Choose a schedule', body: 'Daily at 08:00 (Bangkok time) or weekly on Monday.' },
      { title: 'Choose a channel', body: 'Email, Telegram when the bot is switched on and you have linked your account, or a webhook you set up.' },
      { title: 'Send yourself a preview', body: 'Preview a digest first, and switch any channel off at any time.' },
    ],
    good: ['Verify your email before email digests can be sent.', 'This digest does not use AI or your AI quota.'],
    note: 'A digest tells you which new jobs match the filters. It does not judge whether a job suits you. Run an evaluation for that.',
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
