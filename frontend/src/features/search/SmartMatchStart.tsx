import { Brain, FileText, ListOrdered, Sparkles } from 'lucide-react';
import { AiMark } from '@/components/AiMark';
import { Button } from '@/components/ui/button';

const copy = {
  th: {
    title: 'ให้เอเจนต์จัดอันดับงานให้คุณ', body: 'เอเจนต์จะอ่าน CV ที่เลือก แล้วเรียงงานที่เหมาะกับคุณที่สุดขึ้นก่อน พร้อมเหตุผลสั้น ๆ ของแต่ละงาน',
    steps: ['อ่านทักษะจาก CV', 'เทียบกับงานที่ตรงตัวกรอง', 'ให้คะแนนเต็ม 5 และบอกสิ่งที่ขาด'],
    cost: 'ใช้ AI ทุกครั้งที่เริ่ม ระบบจึงรอให้คุณกดเอง ปรับตัวกรองก่อนได้ แล้วค่อยกดเริ่ม', start: 'เริ่ม Smart match', startWith: (cv: string) => `เริ่ม Smart match ด้วย ${cv}`, noGate: 'ยืนยันอีเมลก่อนจึงจะใช้ได้',
    using: 'ใช้ CV',
  },
  en: {
    title: 'Let the agent rank jobs for you', body: 'The agent reads the CV you chose and puts the jobs that fit you best first, with a short reason for each.',
    steps: ['Reads the skills in your CV', 'Compares jobs that match your filters', 'Scores each out of 5, shows gaps'],
    cost: 'It uses AI every time it runs, so it waits for you to start it. Set your filters first, then start.', start: 'Start Smart match', startWith: (cv: string) => `Start Smart match with ${cv}`, noGate: 'Confirm your email to use this',
    using: 'Using CV',
  },
};

// Smart match uses AI on every run, so it never starts by itself: the user presses Start.
export function SmartMatchStart({ locale, cvName, disabled, title, onStart }: { locale: 'th' | 'en'; cvName: string; disabled: boolean; title?: string; onStart: () => void }) {
  const c = copy[locale];
  const icons = [FileText, ListOrdered, Brain];
  // Header spans the card; steps and the start action share one row so the button lines up with the steps.
  return <section aria-labelledby="smart-start-title" className="grid gap-4 rounded-xl border border-primary/30 bg-gradient-to-b from-accent/60 to-card p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-x-6">
    <div className="flex items-start gap-3 lg:col-span-2">
      <AiMark className="size-10" />
      <div className="min-w-0"><h2 id="smart-start-title" className="text-lg font-semibold">{c.title}</h2><p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{c.body}</p></div>
    </div>
    <ol className="grid auto-rows-fr gap-2 sm:grid-cols-3">{c.steps.map((step, index) => { const Icon = icons[index]; return <li key={step} className="flex items-center gap-2.5 rounded-lg border bg-card/80 px-3 py-2.5 text-sm">
      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-primary"><Icon className="size-3.5" /></span><span className="min-w-0 text-balance">{step}</span>
    </li>; })}</ol>
    <div className="grid content-start gap-1.5">
      <Button type="button" size="lg" className="h-auto min-h-12 whitespace-normal py-2 text-center" disabled={disabled} title={title} onClick={onStart} aria-label={c.startWith(cvName)}><Sparkles className="size-4" aria-hidden="true" />{c.start}</Button>
      <p className="truncate text-center text-xs text-muted-foreground" title={cvName}>{c.using}: <span className="text-foreground">{cvName}</span></p>
    </div>
    <p className="text-xs text-muted-foreground lg:col-span-2">{c.cost}</p>
  </section>;
}
