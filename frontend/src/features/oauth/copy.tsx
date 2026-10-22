import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type Capability = 'results:read' | 'jobs:evaluate' | 'documents:draft' | 'cv:tailor' | 'jobs:search' | 'applications:apply' | 'applications:write';
type Parts = { client: string; list: string; project: string; days: number };
const b = (text: string) => <strong className="font-semibold [overflow-wrap:anywhere]">{text}</strong>;

const th = {
  read: 'อ่านและค้นหา',
  act: 'ทำแทนคุณ',
  changesData: 'เปลี่ยนแปลงข้อมูลของคุณได้',
  actHint: 'สิทธิ์เกี่ยวกับใบสมัครจะไม่ถูกเลือกให้อัตโนมัติ เลือกเฉพาะที่จำเป็น',
  selected: (n: number) => `เลือกแล้ว ${n}`,
  summaryTitle: 'สิ่งที่คุณกำลังอนุญาต',
  none: 'เลือกสิทธิ์อย่างน้อยหนึ่งอย่างเพื่อดำเนินการต่อ',
  changesNote: 'รวมสิทธิ์ที่เปลี่ยนแปลงข้อมูลในโปรเจกต์นี้ได้',
  summary: ({ client, list, project, days }: Parts): ReactNode => <>{b(client)} ทำสิ่งต่อไปนี้ได้ในโปรเจกต์ {b(project)} นาน {days} วัน: {list}</>,
  verbs: { 'results:read': 'อ่านผลลัพธ์', 'jobs:search': 'ค้นหาประกาศงาน', 'jobs:evaluate': 'ประเมินประกาศงาน', 'documents:draft': 'ร่างเอกสาร', 'cv:tailor': 'ปรับ CV', 'applications:apply': 'เตรียมคำตอบใบสมัคร', 'applications:write': 'ย้ายสถานะใบสมัครและเขียนโน้ต' } as Record<Capability, string>,
};

const en: typeof th = {
  read: 'Read',
  act: 'Act for you',
  changesData: 'Can change your data',
  actHint: 'Application permissions are never selected automatically. Choose only what you need.',
  selected: n => `${n} selected`,
  summaryTitle: 'What you are allowing',
  none: 'Select at least one permission to continue.',
  changesNote: 'Includes permissions that can change data in this project.',
  summary: ({ client, list, project, days }) => <>{b(client)} can {list} in {b(project)} for {days} {days === 1 ? 'day' : 'days'}.</>,
  verbs: { 'results:read': 'read results', 'jobs:search': 'search jobs', 'jobs:evaluate': 'evaluate jobs', 'documents:draft': 'draft documents', 'cv:tailor': 'tailor your CV', 'applications:apply': 'prepare application answers', 'applications:write': 'move applications between stages and add notes' },
};

export function useConsentCopy() {
  const lang = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  return { c: lang === 'th' ? th : en, lang };
}
