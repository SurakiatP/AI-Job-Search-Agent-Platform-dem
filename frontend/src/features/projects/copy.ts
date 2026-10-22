import { useTranslation } from 'react-i18next';

const th = {
  open: 'เปิดโปรเจกต์',
  openNamed: (name: string) => `เปิดโปรเจกต์ ${name}`,
  created: (date: string) => `สร้างเมื่อ ${date}`,
  options: (name: string) => `ตัวเลือกของ ${name}`,
  rename: 'เปลี่ยนชื่อ', delete: 'ลบ', cancel: 'ยกเลิก', save: 'บันทึก', saving: 'กำลังบันทึก…', name: 'ชื่อ',
  renameTitle: 'เปลี่ยนชื่อโปรเจกต์',
  deleteTitle: (name: string) => `ลบโปรเจกต์ “${name}”?`,
  deleteBody: 'โปรเจกต์นี้จะถูกลบถาวร ลบได้เฉพาะโปรเจกต์ที่ไม่มี CV งาน หรือประวัติการทำงานของเอเจนต์ และย้อนกลับไม่ได้',
  notEmpty: 'ลบไม่ได้: โปรเจกต์นี้ยังมี CV งาน หรือประวัติการทำงานอยู่',
  failed: 'ดำเนินการไม่สำเร็จ ลองอีกครั้ง',
  emptySteps: ['เพิ่ม CV ของคุณ', 'ค้นหาหรือบันทึกประกาศงาน', 'ประเมินความเหมาะสมกับ CV'],
  emptyIntro: 'โปรเจกต์หนึ่งโปรเจกต์ต่อการหางานหนึ่งแบบ เก็บ CV งาน และเอกสารแยกจากกัน เริ่มได้ใน 3 ขั้น',
  scoped: 'ข้อมูลของแต่ละโปรเจกต์แยกจากกัน',
  nameHint: (count: number) => `ไม่เกิน 200 ตัวอักษร (${count}/200)`,
  nameTooLong: 'ชื่อยาวเกิน 200 ตัวอักษร ย่อให้สั้นลง',
  nameTaken: 'มีโปรเจกต์ชื่อนี้อยู่แล้ว ใช้ชื่ออื่น หรือเปิดโปรเจกต์เดิม',
  nextTitle: 'หลังสร้างโปรเจกต์',
  next: ['คุณจะเข้าสู่หน้าภาพรวมของโปรเจกต์ใหม่', 'เพิ่ม CV แล้วค้นหางานที่อยากประเมิน', 'ผลประเมินจะระบุ CV และงานที่ใช้เสมอ'],
};

const en: typeof th = {
  open: 'Open project',
  openNamed: name => `Open project ${name}`,
  created: date => `Created ${date}`,
  options: name => `Options for ${name}`,
  rename: 'Rename', delete: 'Delete', cancel: 'Cancel', save: 'Save', saving: 'Saving…', name: 'Name',
  renameTitle: 'Rename project',
  deleteTitle: name => `Delete project “${name}”?`,
  deleteBody: 'This permanently deletes the project. It can only be deleted when it has no CV, jobs or agent run history, and this cannot be undone.',
  notEmpty: 'Cannot delete: this project still has a CV, jobs or run history.',
  failed: 'That did not work. Try again.',
  emptySteps: ['Add your CV', 'Search for or save a job posting', 'Evaluate how well it fits your CV'],
  emptyIntro: 'One project per job search keeps its CVs, jobs and documents separate. Start in 3 steps.',
  scoped: 'Each project keeps its own information.',
  nameHint: count => `Up to 200 characters (${count}/200)`,
  nameTooLong: 'The name is over 200 characters. Shorten it.',
  nameTaken: 'A project with this name already exists. Use another name or open the existing one.',
  nextTitle: 'What happens next',
  next: ['You land on the overview of the new project.', 'Add a CV, then find a role to evaluate.', 'Every evaluation names the CV and job it used.'],
};

export function useProjectCopy() {
  const { i18n } = useTranslation();
  return { c: i18n.language.startsWith('th') ? th : en, locale: i18n.language.startsWith('th') ? 'th-TH' : 'en-GB' };
}
