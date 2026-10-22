// Form schema of the CV builder: one entry per section, mirroring backend services/resume.py.
export type Lang = 'th' | 'en';
export type SectionName = 'summary' | 'personal' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'languages'
  | 'awards' | 'publications' | 'volunteer' | 'references' | 'interests';
export type FieldKind = 'text' | 'month' | 'url' | 'textarea' | 'lines' | 'level' | 'bool' | 'keywords';
export type Field = { key: string; kind: FieldKind; th: string; en: string; placeholder?: { th: string; en: string } };
export type Item = Record<string, unknown> & { id: string };
export type ListSection = Exclude<SectionName, 'summary' | 'personal'>;
export type Address = { line: string; subdistrict: string; district: string; province: string; postcode: string };
export type Basics = { name: string; headline: string; email: string; phone: string; location: string; address: Address; address_full: boolean; profiles: { id: string; network: string; url: string }[]; photo?: string };
export const PERSONAL_KEYS = ['birth_date', 'nationality', 'military_status', 'line_id', 'driving_license', 'expected_salary', 'available_from'] as const;
export type Personal = Record<(typeof PERSONAL_KEYS)[number], string>;
export type ResumeData = {
  basics: Basics; summary: { content: string }; summary_hidden: boolean; personal: Personal; personal_hidden: boolean;
  sections: Record<ListSection, { hidden: boolean; items: Item[] }>;
  order: SectionName[]; references_on_request: boolean;
};
export type Draft = { id: string; cv_id: string | null; document_id: string | null; name?: string; resume_data: ResumeData; template_id: TemplateId; accent: AccentId; document_language: Lang; ats_safe: boolean; updated_at: string };
export type TemplateId = 'onyx' | 'kakuna' | 'ditgar' | 'lotus' | 'teak' | 'saffron';
// CR-CVT-01: only these templates print the photo; the two-column ones may confuse ATS.
export const PHOTO_TEMPLATES: TemplateId[] = ['lotus', 'teak', 'saffron'];
export const TWO_COLUMN: TemplateId[] = ['ditgar', 'teak'];
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

export const FIELDS: Record<ListSection, Field[]> = {
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

export function emptyItem(section: ListSection): Item {
  const item: Item = { id: crypto.randomUUID() };
  for (const field of FIELDS[section]) item[field.key] = field.kind === 'lines' || field.kind === 'keywords' ? [] : field.kind === 'bool' ? false : field.kind === 'level' ? null : '';
  return item;
}

/** Drafts saved before CR-02 have no address, personal details or "personal" in the order; fill the defaults. */
export function normalize(data: ResumeData): ResumeData {
  const saved = (data.basics as { address?: Partial<Address> }).address;
  const address: Address = { line: '', subdistrict: '', district: '', province: '', postcode: '', ...saved };
  const personal = Object.fromEntries(PERSONAL_KEYS.map(k => [k, data.personal?.[k] ?? ''])) as Personal;
  const order = data.order.includes('personal') ? data.order : [data.order[0], 'personal' as const, ...data.order.slice(1)];
  return { ...data, basics: { ...data.basics, address, address_full: data.basics.address_full ?? false }, personal,
    personal_hidden: data.personal_hidden ?? true, order };
}
