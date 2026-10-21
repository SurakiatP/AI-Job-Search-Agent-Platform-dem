import { Bell, ClipboardList, MessagesSquare, FileText, FileUser, Rocket, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { useLocale } from '../../app/providers';
import { useOwnerSession } from '../../lib/api';
import { Header } from '../../components/Header';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { landingCopy } from '../landing/copy';

type Topic = { title: string; body: string };
const copy = {
  th: {
    title: 'คู่มือการใช้งาน', intro: 'ทุกอย่างที่ผู้ใช้ใหม่ควรรู้ ตั้งแต่ใส่ CV จนถึงติดตามใบสมัคร เนื้อหาละเอียดแต่ละหัวข้อกำลังจัดทำ',
    home: 'กลับหน้าแรก', start: 'เริ่มใช้งาน', openApp: 'เปิดแอป', quick: 'เริ่มใน 3 ขั้นตอน', topics: 'หัวข้อในคู่มือ', soon: 'เร็ว ๆ นี้',
    list: [
      { title: 'เริ่มต้นใช้งาน', body: 'สร้างบัญชี ยืนยันอีเมล และสร้างโปรเจกต์แรกของคุณ' },
      { title: 'เพิ่ม CV และคลังประสบการณ์', body: 'อัปโหลด CV ให้ AI สกัดประสบการณ์ แล้วตรวจและแก้ไขเองได้' },
      { title: 'ค้นหาและประเมินงาน', body: 'ค้นประกาศงานจริงในไทย ใช้ Smart match และอ่านผลประเมินพร้อมเหตุผล' },
      { title: 'ปรับ CV และร่างเอกสาร', body: 'ให้เอเจนต์ปรับ CV และร่างจดหมาย โดยใช้เฉพาะข้อมูลที่คุณมีจริง' },
      { title: 'ซ้อมสัมภาษณ์', body: 'สร้างชุดคำถามจากการประเมินงาน ซ้อมตอบ ทบทวนด้วยแฟลชการ์ด และขอความเห็นจาก AI' },
      { title: 'ติดตามใบสมัคร', body: 'ลากการ์ดบนบอร์ดเพื่อบันทึกสถานะ แอปไม่ส่งใบสมัครแทนคุณ' },
      { title: 'แจ้งเตือนงานใหม่', body: 'บันทึกการค้นหา แล้วรับสรุปงานใหม่ทางอีเมล Telegram หรือ webhook' },
      { title: 'ความปลอดภัยและข้อมูลของคุณ', body: 'ข้อมูลแต่ละโปรเจกต์แยกกัน และสิ่งที่อาจถูกส่งไปยังบริการ AI' },
    ] satisfies Topic[],
  },
  en: {
    title: 'User guide', intro: 'Everything a new user needs, from adding a CV to tracking applications. The detailed page for each topic is being written.',
    home: 'Back to home', start: 'Get started', openApp: 'Open app', quick: 'Start in 3 steps', topics: 'Topics in the guide', soon: 'Coming soon',
    list: [
      { title: 'Getting started', body: 'Create an account, verify your email and make your first project.' },
      { title: 'Add your CV and experience bank', body: 'Upload a CV, let AI extract your experience, then check and edit it yourself.' },
      { title: 'Search and evaluate jobs', body: 'Search real jobs in Thailand, use Smart match and read the evaluation with its reasons.' },
      { title: 'Tailor your CV and draft documents', body: 'Let the agent tailor your CV and draft letters, using only what you really have.' },
      { title: 'Interview practice', body: 'Create question sets from a job evaluation, practise answers, review with flashcards and get AI feedback.' },
      { title: 'Track applications', body: 'Drag cards on the board to record status. The app never submits for you.' },
      { title: 'Job alerts', body: 'Save a search and get new-job digests by email, Telegram or webhook.' },
      { title: 'Security and your data', body: 'Each project is kept separate, and what may be sent to an AI service.' },
    ] satisfies Topic[],
  },
};
const icons = [Rocket, FileUser, Search, FileText, MessagesSquare, ClipboardList, Bell, ShieldCheck];

// Outline for now: each topic becomes a real page later.
export function DocsPage() {
  const { locale } = useLocale();
  const c = copy[locale];
  const how = landingCopy[locale].how;
  const status = useOwnerSession().status;
  return <div className="min-h-svh text-foreground">
    <Header actions={<>
      <Button asChild size="sm" variant="ghost"><Link to="/">{c.home}</Link></Button>
      {status === 'ready'
        ? <Button asChild size="sm"><Link to="/app/projects">{c.openApp}</Link></Button>
        : status !== 'loading' && <Button asChild size="sm"><Link to="/signup">{c.start}</Link></Button>}
    </>} />
    <main className="mx-auto grid w-full max-w-5xl gap-12 px-4 py-10 sm:px-6 sm:py-14">
      <section className="grid max-w-2xl gap-4">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground"><Sparkles className="size-6" /></span>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{c.title}</h1>
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{c.intro}</p>
      </section>

      <section aria-labelledby="quick-title" className="grid gap-4">
        <h2 id="quick-title" className="text-xl font-semibold">{c.quick}</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {how.map((step, index) => <li key={step.title} className="grid content-start gap-2 rounded-xl border bg-card p-5">
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{index + 1}</span>
            <h3 className="text-base font-semibold leading-snug">{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>)}
        </ol>
      </section>

      <section aria-labelledby="topics-title" className="grid gap-4">
        <h2 id="topics-title" className="text-xl font-semibold">{c.topics}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {c.list.map((topic, index) => {
            const Icon = icons[index];
            return <li key={topic.title} className="grid content-start gap-3 rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <span aria-hidden="true" className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-5" /></span>
                <Badge variant="outline">{c.soon}</Badge>
              </div>
              <h3 className="text-base font-semibold leading-snug [overflow-wrap:anywhere]">{topic.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{topic.body}</p>
            </li>;
          })}
        </ul>
      </section>
    </main>
  </div>;
}
