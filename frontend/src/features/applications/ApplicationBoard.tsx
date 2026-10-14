import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ItemMenu } from '@/components/ItemMenu';
import type { ApplicationCardView, ApplicationStage } from '../../lib/api-types';
import { ACTIVE_STAGES, CLOSED_STAGES, STAGES, stageLabel } from '../../lib/applicationStages';
import { sendJson } from '../projects/useResource';

const copy = {
  th: { move: 'ย้ายไป', closed: 'ปิดแล้ว', contact: 'มีข้อมูลผู้ติดต่อ', saved: (d: number) => (d === 0 ? 'บันทึกวันนี้' : `บันทึกเมื่อ ${d} วันก่อน`), error: 'ย้ายใบสมัครไม่สำเร็จ ลองอีกครั้ง', empty: 'ว่าง' },
  en: { move: 'Move to', closed: 'Closed', contact: 'Has recruiter contact', saved: (d: number) => (d === 0 ? 'Saved today' : `Saved ${d} days ago`), error: 'Could not move application. Try again.', empty: 'Empty' },
};

export function ApplicationBoard({ projectId, cards, onChanged }: { projectId: string; cards: ApplicationCardView[]; onChanged: () => void }) {
  const locale = useTranslation().i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const base = `/app/projects/${projectId}`;
  const [error, setError] = useState(false);

  async function move(card: ApplicationCardView, stage: ApplicationStage) {
    setError(false);
    try {
      await sendJson(`/projects/${projectId}/jobs/${card.job_revision_id}/application-status`, 'PATCH', { application_status: stage });
      onChanged();
    } catch { setError(true); }
  }

  const item = (card: ApplicationCardView) => {
    const days = Math.max(0, Math.floor((Date.now() - Date.parse(card.created_at)) / 86_400_000));
    return <Card key={card.job_revision_id}><CardContent className="grid gap-2 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-medium leading-snug"><Link className="hover:underline" to={`${base}/jobs/${card.job_revision_id}`}>{card.title}</Link></h3>
          {card.company && <p className="break-words text-sm text-muted-foreground">{card.company}</p>}
        </div>
        <ItemMenu label={`${c.move}: ${card.title}`} actions={STAGES.filter(stage => stage !== card.stage).map(stage => ({
          label: stageLabel[stage][locale], icon: <ArrowRight className="size-4" aria-hidden="true" />, onSelect: () => void move(card, stage),
        }))} />
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">{c.saved(days)}{card.has_contact && <Mail className="size-3.5" role="img" aria-label={c.contact} />}</p>
    </CardContent></Card>;
  };

  const closed = cards.filter(card => CLOSED_STAGES.includes(card.stage));
  return <div className="grid min-w-0 gap-4">
    {error && <p role="alert" className="text-sm text-destructive">{c.error}</p>}
    <div className="grid min-w-0 gap-4 md:grid-flow-col md:auto-cols-[minmax(15rem,1fr)] md:overflow-x-auto md:pb-2">
      {ACTIVE_STAGES.map(stage => {
        const inStage = cards.filter(card => card.stage === stage);
        return <section key={stage} aria-labelledby={`stage-${stage}`} className="grid min-w-0 content-start gap-3 rounded-lg bg-muted/40 p-3">
          <h2 id={`stage-${stage}`} className="flex items-center justify-between gap-2 text-sm font-semibold">{stageLabel[stage][locale]}<span className="font-normal text-muted-foreground">{inStage.length}</span></h2>
          {inStage.length ? inStage.map(item) : <p className="text-xs text-muted-foreground">{c.empty}</p>}
        </section>;
      })}
    </div>
    <details className="rounded-lg bg-muted/40 p-3">
      <summary className="min-h-10 cursor-pointer content-center text-sm font-semibold">{c.closed} ({closed.length})</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{closed.map(item)}</div>
    </details>
  </div>;
}
