import type { AccentId, SectionName, TemplateId } from './sections';

type Copy = {
  title: string; titleDoc: string; backCv: string; backDoc: string; loading: string; loadError: string; retry: string; reload: string;
  saved: string; savedAt: (time: string) => string; saving: string; offline: string; offlineLong: string; conflict: string; conflictLong: string; invalid: (path: string) => string;
  stashFound: string; restore: string; discard: string; preview: string; updatePreview: string; previewFailed: string; rendering: string; edit: string;
  template: string; templates: Record<TemplateId, string>; accent: string; accents: Record<AccentId, string>; docLanguage: string; atsWarning: string;
  basics: string; basicsFields: Record<'name' | 'headline' | 'email' | 'phone' | 'location', string>; links: string; network: string; url: string; addLink: string; removeLink: string;
  sections: Record<SectionName, string>; empty: string; moveUp: (s: string) => string; moveDown: (s: string) => string; show: (s: string) => string; hide: (s: string) => string;
  summaryPlaceholder: string; referencesNote: string; onRequest: string; itemLabel: (s: string, n: number) => string; up: string; down: string; remove: string; add: (s: string) => string;
  noLevel: string; level: (n: number) => string; publish: string; publishTitle: string; publishBodyCv: string; publishBodyDoc: string; cancel: string;
  publishedCv: (n: number) => string; publishedDoc: (n: number) => string; open: string; docNote: string;
  address: string; addressFields: Record<'line' | 'subdistrict' | 'district' | 'province' | 'postcode', string>; chooseProvince: string;
  addressFull: string; addressNote: string; personalFields: Record<'birth_date' | 'nationality' | 'military_status' | 'line_id' | 'driving_license' | 'expected_salary' | 'available_from', string>;
  personalPlaceholders: Partial<Record<'birth_date' | 'nationality' | 'military_status' | 'line_id' | 'driving_license' | 'expected_salary' | 'available_from', string>>;
  personalNote: string; cvName: string; docName: string; renameFailed: string; pages: (n: number) => string; tooLong: string;
  errors: { resume_incomplete: string; render_failed: string; draft_conflict: string; resume_invalid: string; document_busy: string; generic: string };
};

export const copy: Record<'th' | 'en', Copy> = {
  th: {
    title: 'สร้าง CV', titleDoc: 'แก้ไข CV ที่ปรับแล้ว', backCv: 'CV และประสบการณ์', backDoc: 'กลับไปที่เอกสาร', loading: 'กำลังโหลด…', loadError: 'โหลดร่าง CV ไม่สำเร็จ', retry: 'ลองอีกครั้ง', reload: 'โหลดร่างล่าสุด',
    saved: 'บันทึกแล้ว', savedAt: t => `บันทึกแล้ว · ${t}`, saving: 'กำลังบันทึก…', offline: 'ยังไม่ได้บันทึก',
    offlineLong: 'บันทึกไม่สำเร็จ ข้อมูลที่กรอกเก็บไว้ในเบราว์เซอร์นี้ชั่วคราว ลองบันทึกอีกครั้งเมื่อเชื่อมต่อได้', conflict: 'ร่างถูกแก้จากที่อื่น',
    conflictLong: 'ร่างนี้ถูกแก้จากแท็บหรือเครื่องอื่น โหลดร่างล่าสุดก่อนแก้ต่อ', invalid: p => `ข้อมูลบางช่องไม่ถูกต้อง${p ? ` (${p})` : ''}`,
    stashFound: 'พบข้อมูลที่ยังไม่ได้บันทึกในเบราว์เซอร์นี้', restore: 'กู้คืน', discard: 'ทิ้ง',
    preview: 'พรีวิว', updatePreview: 'อัปเดตพรีวิว', previewFailed: 'สร้างพรีวิวไม่สำเร็จ ข้อมูลของคุณยังอยู่ ลองอีกครั้ง', rendering: 'กำลังสร้าง PDF…', edit: 'แก้ไข',
    template: 'เทมเพลต', templates: { onyx: 'Onyx', kakuna: 'Kakuna', ditgar: 'Ditgar' }, accent: 'สีเน้น',
    accents: { indigo: 'คราม', blue: 'น้ำเงิน', teal: 'เขียวน้ำทะเล', green: 'เขียว', rose: 'แดงกุหลาบ', slate: 'เทาเข้ม' }, docLanguage: 'ภาษาของ CV',
    atsWarning: 'เทมเพลตสองคอลัมน์ ระบบคัดกรองใบสมัคร (ATS) บางระบบอาจอ่านลำดับข้อมูลผิด ถ้าสมัครผ่านระบบออนไลน์ แนะนำ Onyx หรือ Kakuna',
    basics: 'ข้อมูลติดต่อ', basicsFields: { name: 'ชื่อ-นามสกุล', headline: 'ตำแหน่งหรือคำแนะนำตัวสั้น ๆ', email: 'อีเมล', phone: 'โทรศัพท์', location: 'ที่อยู่ (จังหวัด)' },
    links: 'ลิงก์', network: 'ชื่อลิงก์', url: 'ที่อยู่ลิงก์', addLink: 'เพิ่มลิงก์', removeLink: 'ลบลิงก์',
    sections: { summary: 'สรุปโปรไฟล์', experience: 'ประสบการณ์ทำงาน', education: 'การศึกษา', skills: 'ทักษะ', projects: 'โครงการ', certifications: 'ใบรับรอง',
      personal: 'ข้อมูลส่วนตัว', languages: 'ภาษา', awards: 'รางวัล', publications: 'ผลงานตีพิมพ์', volunteer: 'งานอาสา', references: 'บุคคลอ้างอิง', interests: 'ความสนใจ' },
    empty: 'ยังว่าง', moveUp: s => `เลื่อน${s}ขึ้น`, moveDown: s => `เลื่อน${s}ลง`, show: s => `แสดง${s}ใน CV`, hide: s => `ซ่อน${s}จาก CV`,
    summaryPlaceholder: 'นักวิเคราะห์ข้อมูลที่มีประสบการณ์ 4 ปี ถนัด SQL และ Python',
    referencesNote: 'ข้อมูลบุคคลอ้างอิงเป็นข้อมูลของผู้อื่น ระบบจะไม่ส่งให้ AI และไม่ใช้เป็นหลักฐาน', onRequest: 'แสดงว่า "มีให้เมื่อร้องขอ" แทนรายละเอียด',
    itemLabel: (s, n) => `${s} รายการที่ ${n}`, up: 'ขึ้น', down: 'ลง', remove: 'ลบ', add: s => `เพิ่ม${s}`,
    noLevel: 'ไม่ระบุ', level: n => `${n} จาก 5`, publish: 'บันทึกเป็นเวอร์ชันใหม่', publishTitle: 'บันทึกเป็นเวอร์ชันใหม่ไหม',
    publishBodyCv: 'ระบบจะสร้าง CV ฉบับใหม่จากร่างนี้ ใช้ประเมินงานและปรับ CV ได้ทันที ข้อมูลในหัวข้อต่าง ๆ จะถูกเพิ่มลงคลังประสบการณ์',
    publishBodyDoc: 'ระบบจะสร้างฉบับใหม่ของเอกสารนี้ การแก้ไขนี้อยู่เฉพาะใน CV ที่ปรับแล้ว ไม่ถูกเพิ่มลงคลังประสบการณ์', cancel: 'ยกเลิก',
    publishedCv: n => `บันทึก CV ฉบับที่ ${n} แล้ว`, publishedDoc: n => `บันทึกเอกสารฉบับที่ ${n} แล้ว`, open: 'เปิดดู',
    docNote: 'การแก้ไขในหน้านี้อยู่เฉพาะใน CV ที่ปรับแล้ว ถ้ามีประสบการณ์ใหม่ ให้เพิ่มใน CV ต้นฉบับ',
    address: 'ที่อยู่', addressFields: { line: 'บ้านเลขที่ อาคาร ถนน', subdistrict: 'แขวง/ตำบล', district: 'เขต/อำเภอ', province: 'จังหวัด', postcode: 'รหัสไปรษณีย์' },
    chooseProvince: 'เลือกจังหวัด', addressFull: 'แสดงที่อยู่เต็มใน CV', addressNote: 'ค่าเริ่มต้น CV แสดงเฉพาะเขต/อำเภอและจังหวัด ซึ่งนายจ้างใช้ดูระยะเดินทาง',
    personalFields: { birth_date: 'วันเกิดหรืออายุ', nationality: 'สัญชาติ', military_status: 'สถานภาพทางทหาร', line_id: 'LINE ID', driving_license: 'ใบขับขี่', expected_salary: 'เงินเดือนที่คาดหวัง', available_from: 'วันที่เริ่มงานได้' },
    personalPlaceholders: { birth_date: '15 มีนาคม 2541', nationality: 'ไทย', military_status: 'ผ่านการเกณฑ์ทหารแล้ว', driving_license: 'รถยนต์และรถจักรยานยนต์', expected_salary: '45,000 บาท', available_from: 'ทันที หรือ 1 ธันวาคม 2569' },
    personalNote: 'ข้อมูลส่วนนี้ซ่อนจาก CV จนกว่าคุณจะกดแสดง และไม่ถูกส่งให้ AI บริษัทต่างชาติและระบบคัดกรองใบสมัครมักไม่ต้องการ',
    cvName: 'ชื่อ CV', docName: 'ชื่อเอกสาร', renameFailed: 'เปลี่ยนชื่อไม่สำเร็จ ลองอีกครั้ง', pages: n => `${n} หน้า`,
    tooLong: 'CV ส่วนใหญ่ควรยาว 1–2 หน้า ลองตัดงานเก่าที่ไม่เกี่ยวข้อง หรือรวม bullet ที่คล้ายกัน',
    errors: { resume_incomplete: 'ใส่ชื่อและข้อมูลอย่างน้อยหนึ่งหัวข้อก่อนบันทึก', render_failed: 'สร้าง PDF ไม่สำเร็จ ข้อมูลของคุณยังอยู่ ลองอีกครั้ง',
      draft_conflict: 'ร่างนี้ถูกแก้จากที่อื่น โหลดร่างล่าสุดแล้วลองอีกครั้ง', resume_invalid: 'ข้อมูลบางช่องไม่ถูกต้อง', document_busy: 'เอกสารนี้กำลังถูกประมวลผลอยู่ ลองอีกครั้งในอีกสักครู่', generic: 'บันทึกไม่สำเร็จ ลองอีกครั้ง' },
  },
  en: {
    title: 'Build a CV', titleDoc: 'Edit tailored CV', backCv: 'CV & experience', backDoc: 'Back to document', loading: 'Loading…', loadError: 'Could not load the CV draft', retry: 'Try again', reload: 'Load latest draft',
    saved: 'Saved', savedAt: t => `Saved · ${t}`, saving: 'Saving…', offline: 'Not saved',
    offlineLong: 'Saving failed. What you typed is kept in this browser for now; try again when you are back online.', conflict: 'Changed elsewhere',
    conflictLong: 'This draft was changed in another tab or device. Load the latest draft before you continue.', invalid: p => `Some fields are not valid${p ? ` (${p})` : ''}`,
    stashFound: 'Unsaved changes were found in this browser', restore: 'Restore', discard: 'Discard',
    preview: 'Preview', updatePreview: 'Update preview', previewFailed: 'The preview could not be made. Your data is safe; try again.', rendering: 'Making PDF…', edit: 'Edit',
    template: 'Template', templates: { onyx: 'Onyx', kakuna: 'Kakuna', ditgar: 'Ditgar' }, accent: 'Accent colour',
    accents: { indigo: 'Indigo', blue: 'Blue', teal: 'Teal', green: 'Green', rose: 'Rose', slate: 'Slate' }, docLanguage: 'CV language',
    atsWarning: 'Two columns: some applicant tracking systems (ATS) read them in the wrong order. For online applications, Onyx or Kakuna is safer.',
    basics: 'Contact details', basicsFields: { name: 'Full name', headline: 'Headline', email: 'Email', phone: 'Phone', location: 'Location' },
    links: 'Links', network: 'Label', url: 'Address', addLink: 'Add link', removeLink: 'Remove link',
    sections: { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', projects: 'Projects', certifications: 'Certifications',
      personal: 'Personal details', languages: 'Languages', awards: 'Awards', publications: 'Publications', volunteer: 'Volunteering', references: 'References', interests: 'Interests' },
    empty: 'empty', moveUp: s => `Move ${s} up`, moveDown: s => `Move ${s} down`, show: s => `Show ${s} in the CV`, hide: s => `Hide ${s} from the CV`,
    summaryPlaceholder: 'Data analyst with 4 years of experience in SQL and Python',
    referencesNote: 'References are other people’s details. They are never sent to AI or used as evidence.', onRequest: 'Show "Available on request" instead of details',
    itemLabel: (s, n) => `${s} item ${n}`, up: 'Up', down: 'Down', remove: 'Remove', add: s => `Add ${s.toLowerCase()}`,
    noLevel: 'Not set', level: n => `${n} of 5`, publish: 'Save as new version', publishTitle: 'Save as a new version?',
    publishBodyCv: 'A new CV version is made from this draft and can be used for evaluations and tailoring at once. Its entries are added to your experience bank.',
    publishBodyDoc: 'A new version of this document is made. These edits stay in this tailored CV and are not added to your experience bank.', cancel: 'Cancel',
    publishedCv: n => `CV version ${n} saved.`, publishedDoc: n => `Document version ${n} saved.`, open: 'Open',
    docNote: 'Edits here stay in this tailored CV. Add new experience to your source CV.',
    address: 'Address', addressFields: { line: 'House no., building, road', subdistrict: 'Subdistrict', district: 'District', province: 'Province', postcode: 'Postcode' },
    chooseProvince: 'Choose a province', addressFull: 'Show the full address on the CV', addressNote: 'By default the CV shows only district and province, which employers use to judge the commute.',
    personalFields: { birth_date: 'Date of birth or age', nationality: 'Nationality', military_status: 'Military status', line_id: 'LINE ID', driving_license: 'Driving licence', expected_salary: 'Expected salary', available_from: 'Available from' },
    personalPlaceholders: { birth_date: '15 March 1998', nationality: 'Thai', military_status: 'Completed', driving_license: 'Car and motorcycle', expected_salary: 'THB 45,000', available_from: 'Immediately' },
    personalNote: 'Hidden from the CV until you show it, and never sent to AI. Foreign employers and applicant tracking systems often do not want it.',
    cvName: 'CV name', docName: 'Document name', renameFailed: 'Could not rename. Try again.', pages: n => (n === 1 ? '1 page' : `${n} pages`),
    tooLong: 'Most CVs work best at 1–2 pages. Drop older unrelated jobs or merge similar bullets.',
    errors: { resume_incomplete: 'Add your name and at least one section before saving.', render_failed: 'The PDF could not be made. Your data is safe; try again.',
      draft_conflict: 'This draft changed elsewhere. Load the latest draft and try again.', resume_invalid: 'Some fields are not valid.', document_busy: 'This document is being processed. Try again shortly.', generic: 'Could not save. Try again.' },
  },
};
