import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Locale, SkillCoverage as SkillCoverageData } from '../lib/api-types';

/** Compact "7/10 skills" text for list rows; hidden when there is no coverage. */
export function SkillCount({ coverage, locale }: { coverage?: SkillCoverageData | null; locale: Locale }) {
  if (!coverage) return null;
  return <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{coverage.matched.length}/{coverage.required.length} {locale === 'th' ? 'ทักษะ' : 'skills'}</span>;
}

/** Deterministic keyword coverage, deliberately labelled as separate from the AI fit score. */
export function SkillCoverage({ coverage, locale, className }: { coverage?: SkillCoverageData | null; locale: Locale; className?: string }) {
  if (!coverage) return null;
  const th = locale === 'th';
  const title = th ? 'ทักษะที่ตรงกับประกาศ' : 'Skill match';
  return <section aria-label={title} className={`grid min-w-0 gap-3 ${className ?? ''}`}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h4 className="min-w-0 break-words text-sm font-semibold">{title}</h4>
      <span className="text-2xl font-semibold tabular-nums">{coverage.matched.length}/{coverage.required.length}</span>
    </div>
    <Progress value={Math.round(coverage.ratio * 100)} />
    {coverage.matched.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label={th ? 'ทักษะที่ตรง' : 'Matched skills'}>
      {coverage.matched.map(skill => <li key={skill}><Badge variant="success" className="break-all">{skill}</Badge></li>)}
    </ul>}
    {coverage.missing.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label={th ? 'ทักษะที่ยังขาด' : 'Missing skills'}>
      {coverage.missing.map(skill => <li key={skill}><Badge variant="outline" className="break-all">{skill}</Badge></li>)}
    </ul>}
    <p className="text-xs text-muted-foreground">{th ? 'คำนวณจากคำสำคัญในประกาศและ CV โดยไม่ใช้ AI' : 'Keyword-based, no AI'}</p>
  </section>;
}
