import { Brain, FileText, ListOrdered, Sparkles } from 'lucide-react';
import { AiMark } from '@/components/AiMark';
import { Button } from '@/components/ui/button';

const copy = {
  th: {
    title: 'ให้เอเจนต์จัดอันดับงานให้คุณ', body: 'เอเจนต์จะอ่าน CV ที่เลือก แล้วเรียงงานที่เหมาะกับคุณที่สุดขึ้นก่อน พร้อมเหตุผลสั้น ๆ ของแต่ละงาน',
    steps: ['อ่านทักษะจาก CV', 'เทียบกับงานที่ตรงตัวกรอง', 'ให้คะแนนเต็ม 5 และบอกสิ่งที่ขาด'],
    cost: 'ใช้ AI ทุกครั้งที่เริ่ม ระบบจึงรอให้คุณกดเอง ปรับตัวกรองก่อนได้ แล้วค่อยกดเริ่ม', start: 'เริ่ม Smart match', startWith: (cv: string) => `เริ่ม Smart match ด้วย ${cv}`, noGate: 'ยืนยันอีเมลก่อนจึงจะใช้ได้',
    using: 'จับคู่กับ CV',
    how: 'จับคู่อย่างไร', howLines: ['AI อ่าน CV แล้วเทียบกับประกาศงานทีละงาน', 'คะแนนมาจาก ความตรงกับตำแหน่ง 50% ทักษะ 30% (ทักษะที่ประกาศบอกว่าต้องมีนับสองเท่า) และระดับประสบการณ์ 20%', 'ถ้าขาดทักษะที่ต้องมี คะแนนจะลดลง ผลนี้เป็นการประมาณ ไม่ใช่คำตัดสิน'],
  },
  en: {
    title: 'Let the agent rank jobs for you', body: 'The agent reads the CV you chose and puts the jobs that fit you best first, with a short reason for each.',
    steps: ['Reads the skills in your CV', 'Compares jobs that match your filters', 'Scores each out of 5, shows gaps'],
    cost: 'It uses AI every time it runs, so it waits for you to start it. Set your filters first, then start.', start: 'Start Smart match', startWith: (cv: string) => `Start Smart match with ${cv}`, noGate: 'Confirm your email to use this',
    using: 'Matching with CV',
    how: 'How matching works', howLines: ['The AI reads your CV and compares it with each posting.', 'The score is role fit 50%, skills 30% (skills the posting says are required count double) and seniority 20%.', 'A missing required skill lowers the score. The result is an estimate, not a verdict.'],
  },
};

// Plain-words note on how the score is built (weights live in services/smart_match.py: combine()).
export function HowMatchingWorks({ locale }: { locale: 'th' | 'en' }) {
  const c = copy[locale];
  return <details className="text-sm text-muted-foreground"><summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-foreground lg:min-h-10">{c.how}</summary>
    <ul className="mt-1 grid max-w-2xl list-disc gap-1 ps-5">{c.howLines.map(line => <li key={line}>{line}</li>)}</ul></details>;
}

// Smart match uses AI on every run, so it never starts by itself: the user presses Start.
export function SmartMatchStart({ locale, cvName, disabled, title, onStart }: { locale: 'th' | 'en'; cvName: string; disabled: boolean; title?: string; onStart: () => void }) {
  const c = copy[locale];
  const icons = [FileText, ListOrdered, Brain];
  const stages = ['cv', 'search', 'evaluate'];
  // Header spans the card; steps and the start action share one row so the button lines up with the steps.
  return <section aria-labelledby="smart-start-title" className="grid gap-4 rounded-3xl border border-ai-border bg-card bg-[radial-gradient(60%_90%_at_0%_0%,rgb(49_134_255/0.12),transparent_70%),radial-gradient(50%_80%_at_100%_100%,rgb(139_111_214/0.12),transparent_70%)] p-5 shadow-[var(--shadow-soft)] sm:p-6 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-x-6">
    <div className="flex items-start gap-3 lg:col-span-2">
      <AiMark className="size-10" />
      <div className="min-w-0"><h2 id="smart-start-title" className="text-lg font-semibold">{c.title}</h2><p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{c.body}</p></div>
    </div>
    <ol className="grid auto-rows-fr gap-2 sm:grid-cols-3">{c.steps.map((step, index) => { const Icon = icons[index]; return <li key={step} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
      <span aria-hidden="true" data-stage={stages[index]} data-active="true" className="stage-chip !size-7 !rounded-full"><Icon className="size-3.5" /></span><span className="min-w-0 text-balance">{step}</span>
    </li>; })}</ol>
    <div className="grid content-start gap-2">
      <Button type="button" size="lg" className="bg-primary-fill text-primary-fill-foreground hover:bg-primary-fill/90 active:bg-primary-fill/80 h-auto min-h-12 whitespace-normal py-2 text-center" disabled={disabled} title={title} onClick={onStart} aria-label={c.startWith(cvName)}><Sparkles className="size-4" aria-hidden="true" />{c.start}</Button>
      <p className="truncate text-center text-xs text-muted-foreground" title={cvName}>{c.using}: <span className="text-foreground">{cvName}</span></p>
    </div>
    <p className="text-xs text-muted-foreground lg:col-span-2">{c.cost}</p>
    <div className="lg:col-span-2"><HowMatchingWorks locale={locale} /></div>
  </section>;
}
