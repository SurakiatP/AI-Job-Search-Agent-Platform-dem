import { Check, Circle } from 'lucide-react';
import { BusyNote } from '@/components/BusyNote';

const copy = {
  th: { label: 'กำลังอ่าน CV ของคุณ…', estimate: 'ปกติไม่เกิน 30 วินาทีสำหรับ 1–3 หน้า ไฟล์ยาวกว่านั้นใช้เวลานานขึ้น', steps: ['อัปโหลดไฟล์', 'อ่านหน้า CV', 'พร้อมใช้'], list: 'ขั้นตอนการอ่าน CV' },
  en: { label: 'Reading your CV…', estimate: 'Usually under 30 seconds for 1–3 pages. Longer files take more time.', steps: ['Upload the file', 'Read the pages', 'Ready to use'], list: 'CV reading steps' },
};

// CH-06: shown while a CV upload is being read. The page count is not shown because the upload call does not report pages read so far.
export function CvReadingSteps({ locale }: { locale: 'th' | 'en' }) {
  const c = copy[locale];
  return <div className="grid gap-2" data-testid="cv-reading">
    <BusyNote bar locale={locale} label={c.label} detail={c.estimate} />
    <ol aria-label={c.list} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {c.steps.map((step, i) => <li key={step} aria-current={i === 1 ? 'step' : undefined} className={`flex items-center gap-1.5 ${i === 1 ? 'font-medium' : i === 0 ? '' : 'text-muted-foreground'}`}>
        {i === 0 ? <Check className="size-4 text-primary" aria-hidden="true" /> : <Circle className="size-4" aria-hidden="true" />}{step}
      </li>)}
    </ol>
  </div>;
}
