import { Link } from 'react-router';
import { BookOpen, CheckCircle2, ExternalLink, MinusCircle } from 'lucide-react';
import { AiMark } from '@/components/AiMark';
import { Badge } from '@/components/ui/badge';
import type { ExperienceView, Locale, SkillCoverage } from '../../lib/api-types';
import { useResource } from '../projects/useResource';

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// ASCII skills must match as whole words ("api" must not match "rapid"); other scripts match as plain text.
const mentions = (text: string, skill: string) => /^[\x00-\x7f]+$/.test(skill)
  ? new RegExp(`(^|[^a-z0-9])${escape(skill.toLowerCase())}($|[^a-z0-9])`).test(text.toLowerCase())
  : text.toLowerCase().includes(skill.toLowerCase());

const copy = {
  th: {
    title: 'คำแนะนำจากเอเจนต์', intro: 'เทียบทักษะที่ประกาศต้องการกับ CV และคลังประสบการณ์ของคุณ ไม่เดา และไม่เพิ่มสิ่งที่คุณไม่มี',
    canAdd: 'เพิ่มลง CV ได้', canAddHint: 'มีหลักฐานในคลังประสบการณ์ของคุณแล้ว เอเจนต์ใส่ให้ได้ที่แท็บ "เตรียมเอกสาร"',
    cannot: 'เพิ่มไม่ได้ เพราะไม่มีใน CV และประสบการณ์ของคุณ', cannotHint: 'ระบบจะไม่ใส่ทักษะที่คุณไม่มี ถ้าอยากได้งานนี้ ลองเรียนรู้เพิ่มเติม แล้วเพิ่มลงคลังประสบการณ์เมื่อมีผลงานจริง',
    learn: 'ค้นหาแหล่งเรียน', bank: 'ไปที่คลังประสบการณ์', none: 'ทักษะที่ประกาศต้องการ มีใน CV ของคุณครบแล้ว', noBank: 'ยังไม่มีคลังประสบการณ์ให้เทียบ ทักษะที่ขาดทั้งหมดจึงยังเพิ่มไม่ได้จนกว่าจะมีหลักฐานจาก CV หรือที่คุณเพิ่มเอง',
    evidence: (n: number) => `มีหลักฐาน ${n} รายการ`,
  },
  en: {
    title: 'Agent advice', intro: 'The skills this posting asks for, compared with your CV and experience bank. No guessing, and nothing you do not have gets added.',
    canAdd: 'Can be added to your CV', canAddHint: 'Your experience bank already backs these. The agent can add them from the "Prepare documents" tab.',
    cannot: 'Cannot be added: not in your CV or experience', cannotHint: 'The system will not add a skill you do not have. If you want this job, learn it first, then add it to your experience bank once you have real work to show.',
    learn: 'Find ways to learn', bank: 'Open experience bank', none: 'Your CV already covers every skill the posting asks for.', noBank: 'There is no experience bank to compare against yet, so none of the missing skills can be added until your CV or your own entries back them.',
    evidence: (n: number) => `${n} ${n === 1 ? 'entry backs it' : 'entries back it'}`,
  },
};

export function SkillAdvice({ projectId, locale, coverage }: { projectId: string; locale: Locale; coverage: SkillCoverage }) {
  const c = copy[locale];
  const bank = useResource<ExperienceView>(`/projects/${projectId}/experience`);
  const missing = coverage.missing;
  const items = bank.data?.items ?? [];
  const backed = missing.map(skill => ({ skill, count: items.filter(item => mentions(`${item.text} ${item.role ?? ''}`, skill)).length }));
  const canAdd = backed.filter(entry => entry.count > 0), cannot = backed.filter(entry => entry.count === 0);
  const learnUrl = (skill: string) => `https://www.google.com/search?q=${encodeURIComponent(locale === 'th' ? `เรียน ${skill}` : `learn ${skill}`)}`;
  return <section aria-labelledby={`advice-${projectId}`} className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <AiMark />
      <div className="min-w-0"><h2 id={`advice-${projectId}`} className="text-lg font-semibold">{c.title}</h2><p className="text-sm text-muted-foreground">{c.intro}</p></div>
    </div>
    {missing.length === 0 ? <p role="status" className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-success" aria-hidden="true" />{c.none}</p> : <>
      {bank.status === 'ready' && items.length === 0 && <p className="text-sm text-muted-foreground">{c.noBank}</p>}
      {canAdd.length > 0 && <div className="grid gap-2 rounded-lg border border-success/40 bg-success/5 p-3" data-testid="advice-can-add">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-success" aria-hidden="true" />{c.canAdd}</h3>
        <p className="text-xs text-muted-foreground">{c.canAddHint}</p>
        <ul className="flex flex-wrap gap-2">{canAdd.map(({ skill, count }) => <li key={skill}><Badge variant="success" className="gap-1.5 break-all">{skill}<span className="font-normal opacity-80">· {c.evidence(count)}</span></Badge></li>)}</ul>
      </div>}
      {cannot.length > 0 && bank.status !== 'loading' && <div className="grid gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3" data-testid="advice-cannot-add">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><MinusCircle className="size-4 text-warning" aria-hidden="true" />{c.cannot}</h3>
        <p className="text-xs text-muted-foreground">{c.cannotHint}</p>
        <ul className="grid gap-2">{cannot.map(({ skill }) => <li key={skill} className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline" className="break-all">{skill}</Badge>
          <a href={learnUrl(skill)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-sm text-primary hover:underline"><BookOpen className="size-4" aria-hidden="true" />{c.learn}<ExternalLink className="size-3.5" aria-hidden="true" /></a>
        </li>)}</ul>
      </div>}
      <Link to={`/app/projects/${projectId}/profile?tab=experience`} className="text-sm text-primary hover:underline">{c.bank}</Link>
    </>}
  </section>;
}
