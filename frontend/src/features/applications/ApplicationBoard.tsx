import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronRight, Columns3, GripVertical, List, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/StatusBadge';
import { ItemMenu } from '@/components/ItemMenu';
import type { ApplicationCardView, ApplicationStage } from '../../lib/api-types';
import { ACTIVE_STAGES, CLOSED_STAGES, STAGES, stageLabel } from '../../lib/applicationStages';
import { cn } from '@/lib/utils';
import { selectClass } from '../settings/Field';
import { sendJson } from '../projects/useResource';

const rowColumns = 'md:grid-cols-[minmax(0,1.8fr)_11rem_minmax(0,1.2fr)_8rem_1.5rem]';
const nextStepKey: Record<ApplicationStage, string> = {
  saved: 'nextSaved', applied: 'nextApplied', responded: 'nextResponded', interview: 'nextInterview',
  offer: 'nextOffer', hired: 'nextHired', rejected: 'nextClosed', withdrawn: 'nextClosed',
};

function OpportunityRow({ projectId, card, locale, onMove, updatedLabel }: {
  projectId: string;
  card: ApplicationCardView;
  locale: 'th' | 'en';
  onMove: (card: ApplicationCardView, stage: ApplicationStage) => void;
  updatedLabel: (date: string) => string;
}) {
  const { t } = useTranslation('applicationsWorkspace');
  return <li className={`relative grid min-w-0 grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-x-3 gap-y-2 py-3 hover:bg-accent/40 md:gap-x-5 ${rowColumns}`}>
    <div className="min-w-0 md:col-start-1 md:row-start-1">
      <Link className="block break-words font-medium text-foreground after:absolute after:inset-0 hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring" to={`/app/projects/${projectId}/jobs/${card.job_revision_id}`}>{card.title}</Link>
      {card.company && <p className="mt-0.5 break-words text-sm text-muted-foreground">{card.company}</p>}
    </div>
    <ChevronRight className="size-5 text-muted-foreground md:col-start-5 md:row-start-1" aria-hidden="true" />
    <div className="relative z-10 col-span-2 grid gap-1 md:col-span-1 md:col-start-2 md:row-start-1">
      <span className="text-xs text-muted-foreground md:hidden" aria-hidden="true">{t('stage')}</span>
      <select className={selectClass} aria-label={t('stageFor', { title: card.title })} value={card.stage} onChange={event => onMove(card, event.target.value as ApplicationStage)}>
        {STAGES.map(stage => <option key={stage} value={stage}>{stageLabel[stage][locale]}</option>)}
      </select>
    </div>
    <p className="col-span-2 text-sm text-muted-foreground md:col-span-1 md:col-start-3 md:row-start-1"><span className="md:hidden">{t('nextStep')}: </span>{t(nextStepKey[card.stage])}</p>
    <p className="col-span-2 text-xs text-muted-foreground md:col-span-1 md:col-start-4 md:row-start-1">{updatedLabel(card.last_activity_at || card.created_at)}</p>
  </li>;
}

export function ApplicationBoard({ projectId, cards, onChanged }: { projectId: string; cards: ApplicationCardView[]; onChanged: () => void }) {
  const { t, i18n } = useTranslation('applicationsWorkspace');
  const locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'board' ? 'board' : 'list';
  const [error, setError] = useState(false);
  const [optimisticCards, setOptimisticCards] = useState<ApplicationCardView[] | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<ApplicationStage | ''>('');
  const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const [moved, setMoved] = useState<{ card: ApplicationCardView; from: ApplicationStage } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<ApplicationStage | null>(null);
  const inFlight = useRef(0);
  const visibleCards = optimisticCards ?? cards;
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  useEffect(() => { setOptimisticCards(null); }, [cards]);
  useEffect(() => {
    if (!moved) return;
    const timer = window.setTimeout(() => setMoved(null), 10000);
    return () => window.clearTimeout(timer);
  }, [moved]);

  function selectView(nextView: 'list' | 'board') {
    const next = new URLSearchParams(searchParams);
    if (nextView === 'list') next.delete('view');
    else next.set('view', 'board');
    setSearchParams(next, { replace: true });
  }

  // Keeps the board in step with the server (other tabs, connected assistants): refresh while visible, never mid-drag or mid-save.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && !dragId && inFlight.current === 0) onChanged(); };
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [dragId, onChanged]);

  // Drop zones for a stage: native drag and drop, so no new dependency; the menu and select stay for keyboard and touch.
  const zone = (stage: ApplicationStage) => ({
    'data-drop-stage': stage,
    onDragOver: (event: DragEvent) => { if (!dragId) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOverStage(stage); },
    onDragLeave: (event: DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverStage(current => (current === stage ? null : current)); },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const id = event.dataTransfer.getData('text/plain') || dragId;
      const card = visibleCards.find(entry => entry.job_revision_id === id);
      setDragId(null); setOverStage(null);
      if (card && card.stage !== stage) void move(card, stage);
    },
  });
  const zoneClass = (stage: ApplicationStage) => cn('transition-colors', overStage === stage && 'bg-accent ring-2 ring-primary');

  async function move(card: ApplicationCardView, stage: ApplicationStage, isUndo = false) {
    setError(false);
    inFlight.current += 1;
    const before = visibleCards;
    setOptimisticCards(before.map(item => item.job_revision_id === card.job_revision_id ? { ...item, stage, last_activity_at: new Date().toISOString() } : item));
    try {
      await sendJson(`/projects/${projectId}/jobs/${card.job_revision_id}/application-status`, 'PATCH', { application_status: stage });
      setMoved(isUndo ? null : { card: { ...card, stage }, from: card.stage });
      onChanged();
    } catch {
      setOptimisticCards(before);
      setError(true);
    } finally { inFlight.current -= 1; }
  }

  const updatedLabel = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : t('updated', { date: dateFormat.format(date) });
  };
  const item = (card: ApplicationCardView) => <div key={card.job_revision_id} draggable data-card={card.job_revision_id}
    onDragStart={event => { event.dataTransfer.setData('text/plain', card.job_revision_id); event.dataTransfer.effectAllowed = 'move'; setDragId(card.job_revision_id); }}
    onDragEnd={() => { setDragId(null); setOverStage(null); }}
    className={cn('min-w-0 cursor-grab rounded-md border border-border bg-card px-3 py-2.5 shadow-sm transition-[opacity,box-shadow] active:cursor-grabbing hover:shadow', dragId === card.job_revision_id && 'opacity-40')}>
    <div className="flex min-w-0 items-start gap-1">
      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/60 max-md:hidden" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <Link className="block break-words font-medium leading-snug text-foreground hover:text-primary hover:underline" to={`/app/projects/${projectId}/jobs/${card.job_revision_id}`}>{card.title}</Link>
        {card.company && <p className="mt-0.5 break-words text-sm text-muted-foreground">{card.company}</p>}
      </div>
      <ItemMenu className="size-10 shrink-0" label={`${t('moveTo')}: ${card.title}`} actions={STAGES.filter(stage => stage !== card.stage).map(stage => ({
        label: stageLabel[stage][locale], icon: <ArrowRight className="size-4" aria-hidden="true" />, onSelect: () => void move(card, stage),
      }))} />
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <StatusBadge status={card.stage} locale={locale} />
      <p className="text-xs text-muted-foreground">{updatedLabel(card.last_activity_at || card.created_at)}</p>
      {card.has_contact && <p className="text-xs text-muted-foreground">{t('hasContact')}</p>}
    </div>
  </div>;

  const needle = query.trim().toLowerCase();
  const shown = visibleCards
    .filter(card => (!stageFilter || card.stage === stageFilter) && (!needle || `${card.title} ${card.company ?? ''}`.toLowerCase().includes(needle)))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, locale) : (b.last_activity_at || b.created_at).localeCompare(a.last_activity_at || a.created_at));
  const closed = shown.filter(card => CLOSED_STAGES.includes(card.stage));
  const filtering = Boolean(needle || stageFilter);
  return <div className="grid min-w-0 gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-md border border-input bg-card p-1" aria-label={t('listLabel')}>
        <Button type="button" size="sm" variant={view === 'list' ? 'default' : 'ghost'} aria-pressed={view === 'list'} onClick={() => selectView('list')}><List className="size-4" aria-hidden="true" />{t('listView')}</Button>
        <Button type="button" size="sm" variant={view === 'board' ? 'default' : 'ghost'} aria-pressed={view === 'board'} onClick={() => selectView('board')}><Columns3 className="size-4" aria-hidden="true" />{t('boardView')}</Button>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
        <div className="relative col-span-2 min-w-0 sm:w-72">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" className="ps-9" aria-label={t('searchLabel')} placeholder={t('searchPlaceholder')} value={query} onChange={event => setQuery(event.target.value)} />
        </div>
        <select className={cn(selectClass, 'sm:w-auto')} aria-label={t('stageFilter')} value={stageFilter} onChange={event => setStageFilter(event.target.value as ApplicationStage | '')}>
          <option value="">{t('allStages')}</option>
          {STAGES.map(stage => <option key={stage} value={stage}>{stageLabel[stage][locale]}</option>)}
        </select>
        <select className={cn(selectClass, 'sm:w-auto')} aria-label={t('sortLabel')} value={sort} onChange={event => setSort(event.target.value as 'recent' | 'title')}>
          <option value="recent">{t('sortRecent')}</option>
          <option value="title">{t('sortTitle')}</option>
        </select>
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{t('moveError')}</p>}
    <div role="status" className="min-h-0 text-sm">
      {moved && <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{t('movedNotice', { title: moved.card.title, stage: stageLabel[moved.card.stage][locale] })}</span>
        <Button type="button" variant="link" size="sm" className="h-auto min-h-10 px-0" onClick={() => void move(moved.card, moved.from, true)}>{t('undo')}</Button>
      </p>}
    </div>

    {shown.length === 0 ? <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6">
      <p className="font-medium">{t('noMatches')}</p><p className="text-sm text-muted-foreground">{t('noMatchesNext')}</p>
      {filtering && <Button type="button" variant="outline" size="sm" onClick={() => { setQuery(''); setStageFilter(''); }}>{t('clearFilters')}</Button>}
    </div> : view === 'list' ? <section aria-label={t('listLabel')} className="min-w-0 rounded-lg border border-border bg-card px-4 md:px-5">
      <div className={`hidden gap-x-5 border-b py-3 text-xs font-semibold text-muted-foreground md:grid ${rowColumns}`}>
        <span>{t('opportunity')}</span><span>{t('stage')}</span><span>{t('nextStep')}</span><span>{t('lastActivity')}</span><span className="sr-only">{t('boardView')}</span>
      </div>
      <ul aria-label={t('listLabel')} className="min-w-0 divide-y">
        {shown.map(card => <OpportunityRow key={card.job_revision_id} projectId={projectId} card={card} locale={locale} onMove={(row, stage) => void move(row, stage)} updatedLabel={updatedLabel} />)}
      </ul>
    </section> : <div className="grid min-w-0 gap-4" aria-label={t('boardLabel')}>
      <p className="text-xs text-muted-foreground max-md:hidden">{t('dragHint')}</p>
      <div className="grid min-w-0 gap-4 md:grid-flow-col md:auto-cols-[minmax(15rem,1fr)] md:overflow-x-auto md:pb-2">
        {ACTIVE_STAGES.map(stage => {
          const inStage = shown.filter(card => card.stage === stage);
          return <section key={stage} aria-labelledby={`stage-${stage}`} {...zone(stage)} className={cn('grid min-w-0 content-start gap-3 rounded-lg bg-muted/40 p-3', zoneClass(stage))}>
            <h2 id={`stage-${stage}`} className="flex items-center justify-between gap-2 text-sm font-semibold">{stageLabel[stage][locale]}<span className="font-normal text-muted-foreground">{inStage.length}</span></h2>
            {inStage.length ? inStage.map(item) : <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{dragId ? t('dropHere') : t('noApplications')}</p>}
          </section>;
        })}
      </div>
      <section aria-labelledby="closed-stage-heading" className="min-w-0 rounded-lg bg-muted/40 p-3">
        <h2 id="closed-stage-heading"><button type="button" aria-expanded={closedOpen} onClick={() => setClosedOpen(value => !value)} className="flex min-h-10 w-full items-center justify-between gap-2 text-start text-sm font-semibold">{t('closedStages')} ({closed.length})<span aria-hidden="true">{closedOpen ? '−' : '+'}</span></button></h2>
        {(closedOpen || dragId) && <div className="mt-3 grid gap-3">
          {dragId && <div className="grid gap-2 sm:grid-cols-2">{CLOSED_STAGES.map(stage => <div key={stage} {...zone(stage)} className={cn('rounded-md border border-dashed px-3 py-4 text-center text-sm font-medium', zoneClass(stage))}>{t('dropTo', { stage: stageLabel[stage][locale] })}</div>)}</div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{closed.map(item)}</div>
        </div>}
      </section>
    </div>}
  </div>;
}
