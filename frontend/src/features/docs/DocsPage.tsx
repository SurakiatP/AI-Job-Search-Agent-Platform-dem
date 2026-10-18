import { Link } from 'react-router';
import { useLocale } from '../../app/providers';
import { Header } from '../../components/Header';
import { Button } from '../../components/ui/button';

const copy = {
  th: { title: 'คู่มือการใช้งาน', intro: 'เริ่มต้นใช้แอปสำหรับผู้ใช้ใหม่ เนื้อหาละเอียดกำลังจัดทำ', soon: 'เร็ว ๆ นี้', home: 'กลับหน้าแรก', sections: ['เริ่มต้นใช้งาน', 'เพิ่ม CV และคลังประสบการณ์', 'ค้นหาและประเมินงาน', 'ปรับ CV และร่างเอกสาร', 'ติดตามใบสมัคร', 'ความปลอดภัยและข้อมูลของคุณ'] },
  en: { title: 'User guide', intro: 'A guide for new users. The detailed pages are being written.', soon: 'Coming soon', home: 'Back to home', sections: ['Getting started', 'Add your CV and experience bank', 'Search and evaluate jobs', 'Tailor your CV and draft documents', 'Track applications', 'Security and your data'] },
};

// Outline only for now: the real guide pages come later.
export function DocsPage() {
  const { locale } = useLocale();
  const c = copy[locale];
  return <div className="text-foreground">
    <Header actions={<Button asChild size="sm" variant="ghost"><Link to="/">{c.home}</Link></Button>} />
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10 sm:px-6">
      <div className="grid gap-1"><h1 className="text-2xl font-semibold">{c.title}</h1><p className="text-sm text-muted-foreground">{c.intro}</p></div>
      <ol className="grid gap-2">{c.sections.map((name, index) => <li key={name} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <span className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{index + 1}</span><span className="min-w-0 break-words font-medium">{name}</span></span>
        <span className="shrink-0 text-xs text-muted-foreground">{c.soon}</span>
      </li>)}</ol>
    </main>
  </div>;
}
