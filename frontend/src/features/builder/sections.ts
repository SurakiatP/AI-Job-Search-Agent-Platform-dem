// Form schema of the CV builder: one entry per section, mirroring backend services/resume.py.
export type Lang = 'th' | 'en';
export type SectionName = 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'languages'
  | 'awards' | 'publications' | 'volunteer' | 'references' | 'interests';
export type FieldKind = 'text' | 'month' | 'url' | 'textarea' | 'lines' | 'level' | 'bool' | 'keywords';
export type Field = { key: string; kind: FieldKind; th: string; en: string; placeholder?: { th: string; en: string } };
export type Item = Record<string, unknown> & { id: string };
export type Basics = { name: string; headline: string; email: string; phone: string; location: string; profiles: { id: string; network: string; url: string }[] };
export type ResumeData = {
  basics: Basics; summary: { content: string }; summary_hidden: boolean;
  sections: Record<Exclude<SectionName, 'summary'>, { hidden: boolean; items: Item[] }>;
  order: SectionName[]; references_on_request: boolean;
};
export type Draft = { id: string; cv_id: string | null; document_id: string | null; resume_data: ResumeData; template_id: TemplateId; accent: AccentId; document_language: Lang; ats_safe: boolean; updated_at: string };
export type TemplateId = 'onyx' | 'kakuna' | 'ditgar';
export type AccentId = 'indigo' | 'blue' | 'teal' | 'green' | 'rose' | 'slate';

export const ACCENTS: { id: AccentId; hex: string }[] = [
  { id: 'indigo', hex: '#3730A3' }, { id: 'blue', hex: '#1D4ED8' }, { id: 'teal', hex: '#115E59' },
  { id: 'green', hex: '#166534' }, { id: 'rose', hex: '#9F1239' }, { id: 'slate', hex: '#334155' },
];

const f = (key: string, kind: FieldKind, th: string, en: string, placeholder?: { th: string; en: string }): Field => ({ key, kind, th, en, placeholder });
const START = f('start', 'month', 'เริ่ม', 'Start');
const END = f('end', 'month', 'สิ้นสุด', 'End');
const HIGHLIGHTS = f('highlights', 'lines', 'รายละเอียด (บรรทัดละ 1 ข้อ)', 'Details (one per line)',
  { th: 'สร้างแดชบอร์ดยอดขายด้วย SQL\nลดเวลาทำรายงานจาก 2 วันเหลือ 2 ชั่วโมง', en: 'Built a sales dashboard in SQL\nCut reporting time from 2 days to 2 hours' });

export const FIELDS: Record<Exclude<SectionName, 'summary'>, Field[]> = {
  experience: [f('position', 'text', 'ตำแหน่ง', 'Position', { th: 'นักวิเคราะห์ข้อมูล', en: 'Data Analyst' }),
    f('company', 'text', 'บริษัท', 'Company'), f('location', 'text', 'สถานที่', 'Location'), START, END,
    f('current', 'bool', 'ยังทำงานอยู่', 'I work here now'), HIGHLIGHTS],
  education: [f('institution', 'text', 'สถาบัน', 'Institution'), f('degree', 'text', 'วุฒิ', 'Degree'),
    f('area', 'text', 'สาขา', 'Field of study'), f('grade', 'text', 'เกรด', 'Grade'), START, END],
  skills: [f('name', 'text', 'ทักษะ', 'Skill', { th: 'SQL', en: 'SQL' }), f('level', 'level', 'ระดับ (ไม่บังคับ)', 'Level (optional)'),
    f('keywords', 'keywords', 'คำสำคัญ (คั่นด้วยจุลภาค)', 'Keywords (comma separated)')],
  projects: [f('name', 'text', 'ชื่อโครงการ', 'Project name'), f('role', 'text', 'บทบาท', 'Role'), f('url', 'url', 'ลิงก์', 'Link'), START, END, HIGHLIGHTS],
  certifications: [f('name', 'text', 'ชื่อใบรับรอง', 'Certificate'), f('issuer', 'text', 'ผู้ออก', 'Issuer'), f('date', 'month', 'วันที่ได้รับ', 'Date'), f('url', 'url', 'ลิงก์', 'Link')],
  languages: [f('name', 'text', 'ภาษา', 'Language'), f('level', 'text', 'ระดับ', 'Level', { th: 'ดีมาก', en: 'Fluent' })],
  awards: [f('title', 'text', 'รางวัล', 'Award'), f('awarder', 'text', 'ผู้มอบ', 'Awarded by'), f('date', 'month', 'วันที่', 'Date'), f('summary', 'textarea', 'รายละเอียด', 'Details')],
  publications: [f('title', 'text', 'ชื่อผลงาน', 'Title'), f('publisher', 'text', 'ผู้เผยแพร่', 'Publisher'), f('date', 'month', 'วันที่', 'Date'), f('url', 'url', 'ลิงก์', 'Link')],
  volunteer: [f('organization', 'text', 'องค์กร', 'Organization'), f('role', 'text', 'บทบาท', 'Role'), START, END, HIGHLIGHTS],
  references: [f('name', 'text', 'ชื่อ', 'Name'), f('relation', 'text', 'ความเกี่ยวข้อง', 'Relation'), f('contact', 'text', 'ช่องทางติดต่อ', 'Contact')],
  interests: [f('name', 'text', 'ความสนใจ', 'Interest')],
};

export function emptyItem(section: Exclude<SectionName, 'summary'>): Item {
  const item: Item = { id: crypto.randomUUID() };
  for (const field of FIELDS[section]) item[field.key] = field.kind === 'lines' || field.kind === 'keywords' ? [] : field.kind === 'bool' ? false : field.kind === 'level' ? null : '';
  return item;
}
