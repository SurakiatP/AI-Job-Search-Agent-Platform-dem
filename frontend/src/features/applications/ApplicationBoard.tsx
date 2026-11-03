import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronDown, ChevronRight, Columns3, GripVertical, List, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { CompanyMark } from '@/components/CompanyMark';
import { StatusBadge } from '@/components/StatusBadge';
import { ItemMenu } from '@/components/ItemMenu';
import type { ApplicationCardView, ApplicationStage } from '../../lib/api-types';
import { ACTIVE_STAGES, CLOSED_STAGES, STAGES, stageLabel } from '../../lib/applicationStages';
import { cn } from '@/lib/utils';
import { sendJson } from '../projects/useResource';
import { dateLocale } from '../../lib/locale';

const rowColumns = 'md:grid-cols-[2rem_minmax(0,1.8fr)_11rem_minmax(0,1.2fr)_8rem_1.5rem]';
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
  return <li className={`relative grid min-w-0 grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-x-3 gap-y-2 px-4 py-3 min-h-14 hover:bg-muted/40 md:gap-x-5 ${rowColumns}`}>
    <div className="hidden md:col-start-1 md:row-start-1 md:block"><CompanyMark name={card.company} size={32} /></div>
    <div className="min-w-0 md:col-start-2 md:row-start-1">
      <Link className="block break-words font-medium text-foreground after:absolute after:inset-0 hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring" to={`/app/projects/${projectId}/jobs/${card.job_revision_id}`}>{card.title}</Link>
      {card.company && <p className="mt-0.5 break-words text-sm text-muted-foreground">{card.company}</p>}
    </div>
    <ChevronRight className="size-5 text-muted-foreground md:col-start-6 md:row-start-1" aria-hidden="true" />
    <div className="relative z-10 col-span-2 grid gap-1 md:col-span-1 md:col-start-3 md:row-start-1">
      <span className="text-xs text-muted-foreground md:hidden" aria-hidden="true">{t('stage')}</span>
      <span className="relative inline-flex w-fit items-center" data-app-stage={card.stage}>
        <span className="stage-dot pointer-events-none absolute start-3" aria-hidden="true" />
        <ChevronDown className="pointer-events-none absolute end-2 size-4 text-muted-foreground" aria-hidden="true" />
        <select className="min-h-11 cursor-pointer appearance-none rounded-lg border border-[color:var(--border-strong)] bg-card ps-8 pe-8 text-sm lg:min-h-9 pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('stageFor', { title: card.title })} value={card.stage} onChange={event => onMove(card, event.target.value as ApplicationStage)}>
          {STAGES.map(stage => <option key={stage} value={stage}>{stageLabel[stage][locale]}</option>)}
        </select>
      </span>
    </div>
    <p className="col-span-2 text-sm text-muted-foreground md:col-span-1 md:col-start-4 md:row-start-1"><span className="md:hidden">{t('nextStep')}: </span>{t(nextStepKey[card.stage])}</p>
    <p className="col-span-2 text-xs text-muted-foreground md:col-span-1 md:col-start-5 md:row-start-1">{updatedLabel(card.last_activity_at || card.created_at)}</p>
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
  const [closedFilter, setClosedFilter] = useState(false);
  const [stageFilter, setStageFilter] = useState<ApplicationStage | ''>('');
  const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const [moved, setMoved] = useState<{ card: ApplicationCardView; from: ApplicationStage } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<ApplicationStage | null>(null);
  const inFlight = useRef(0);
  const visibleCards = optimisticCards ?? cards;
  const dateFormat = new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: 'medium' });

  useEffect(() => { if (inFlight.current === 0) setOptimisticCards(null); }, [cards]);
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
    setOptimisticCards(visibleCards.map(item => item.job_revision_id === card.job_revision_id ? { ...item, stage, last_activity_at: new Date().toISOString() } : item));
    try {
      await sendJson(`/projects/${projectId}/jobs/${card.job_revision_id}/application-status`, 'PATCH', { application_status: stage });
      setMoved(isUndo ? null : { card: { ...card, stage }, from: card.stage });
      onChanged();
    } catch {
      setOptimisticCards(current => (current ?? cards).map(item => item.job_revision_id === card.job_revision_id ? { ...item, stage: card.stage, last_activity_at: card.last_activity_at } : item));
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
    className={cn('min-w-0 cursor-grab rounded-lg border border-border bg-card p-3 transition-[opacity,border-color] active:cursor-grabbing hover:border-[color:var(--border-strong)]', dragId === card.job_revision_id && 'opacity-40')}>
    <div className="flex min-w-0 items-start gap-1">
      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/60 max-md:hidden" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <Link className="block break-words font-medium leading-snug text-foreground hover:text-primary hover:underline" to={`/app/projects/${projectId}/jobs/${card.job_revision_id}`}>{card.title}</Link>
        {card.company && <p className="mt-0.5 break-words text-sm text-muted-foreground">{card.company}</p>}
      </div>
      <ItemMenu className="size-11 shrink-0 lg:size-10" label={`${t('moveTo')}: ${card.title}`} actions={STAGES.filter(stage => stage !== card.stage).map(stage => ({
        label: stageLabel[stage][locale], icon: <ArrowRight className="size-4" aria-hidden="true" />, onSelect: () => void move(card, stage),
      }))} />
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2">
      <StatusBadge status={card.stage} locale={locale} />
      <p className="text-xs text-muted-foreground">{updatedLabel(card.last_activity_at || card.created_at)}</p>
      {card.has_contact && <p className="text-xs text-muted-foreground">{t('hasContact')}</p>}
    </div>
  </div>;

  const needle = query.trim().toLowerCase();
  const shown = visibleCards
    .filter(card => (!stageFilter || card.stage === stageFilter) && (!closedFilter || CLOSED_STAGES.includes(card.stage)) && (!needle || `${card.title} ${card.company ?? ''}`.toLowerCase().includes(needle)))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, locale) : (b.last_activity_at || b.created_at).localeCompare(a.last_activity_at || a.created_at));
  const closed = shown.filter(card => CLOSED_STAGES.includes(card.stage));
  const filtering = Boolean(needle || stageFilter || closedFilter);
  const count = (stage: ApplicationStage) => visibleCards.filter(card => card.stage === stage).length;
  const closedTotal = visibleCards.filter(card => CLOSED_STAGES.includes(card.stage)).length;
  const railButton = 'shrink-0 gap-2 tabular-nums';
  return <div className="grid min-w-0 gap-4">
    <div role="group" aria-label={t('board.byStage')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {ACTIVE_STAGES.map(stage => <Button key={stage} type="button" size="sm" variant="outline" className={railButton} aria-pressed={stageFilter === stage} onClick={() => { setClosedFilter(false); setStageFilter(current => (current === stage ? '' : stage)); }}>
        <span className="stage-dot" data-app-stage={stage} aria-hidden="true" />{stageLabel[stage][locale]}<span className="tabular-nums text-muted-foreground">{count(stage)}</span>
      </Button>)}
      <Button type="button" size="sm" variant="outline" className={railButton} aria-label={`${t('board.closedCount')}: ${closedTotal}`} aria-pressed={closedFilter} onClick={() => { setStageFilter(''); setClosedFilter(value => !value); }}>
        <span className="stage-dot" aria-hidden="true" />{t('closedStages')}<span className="tabular-nums text-muted-foreground">{closedTotal}</span>
      </Button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" className="segmented" aria-label={t('viewLabel')}>
        <Button type="button" size="sm" variant="ghost" aria-pressed={view === 'list'} onClick={() => selectView('list')}><List className="size-4" aria-hidden="true" />{t('listView')}</Button>
        <Button type="button" size="sm" variant="ghost" aria-pressed={view === 'board'} onClick={() => selectView('board')}><Columns3 className="size-4" aria-hidden="true" />{t('boardView')}</Button>
      </div>
      <div className="grid min-w-0 basis-full grid-cols-2 gap-2 sm:basis-0 sm:flex-1 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
        <div className="relative col-span-2 min-w-0 sm:w-72">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" className="ps-10" aria-label={t('searchLabel')} placeholder={t('searchPlaceholder')} value={query} onChange={event => setQuery(event.target.value)} />
        </div>
        <Select className="sm:w-auto" aria-label={t('stageFilter')} value={stageFilter} onChange={event => { setStageFilter(event.target.value as ApplicationStage | ''); setClosedFilter(false); }}>
          <option value="">{t('allStages')}</option>
          {STAGES.map(stage => <option key={stage} value={stage}>{stageLabel[stage][locale]}</option>)}
        </Select>
        <Select className="sm:w-auto" aria-label={t('sortLabel')} value={sort} onChange={event => setSort(event.target.value as 'recent' | 'title')}>
          <option value="recent">{t('sortRecent')}</option>
          <option value="title">{t('sortTitle')}</option>
        </Select>
      </div>
    </div>
    {error && <Alert severity="error">{t('moveError')}</Alert>}
    <div role="status" className="min-h-0 text-sm">
      {moved && <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{t('movedNotice', { title: moved.card.title, stage: stageLabel[moved.card.stage][locale] })}</span>
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => void move(moved.card, moved.from, true)}>{t('undo')}</Button>
      </p>}
    </div>

    {shown.length === 0 ? <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6">
      <p className="font-medium">{t('noMatches')}</p><p className="text-sm text-muted-foreground">{t('noMatchesNext')}</p>
      {filtering && <Button type="button" variant="outline" size="sm" onClick={() => { setQuery(''); setStageFilter(''); setClosedFilter(false); }}>{t('clearFilters')}</Button>}
    </div> : view === 'list' ? <section aria-label={t('listLabel')} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className={`hidden gap-x-5 border-b px-4 py-3 text-xs font-medium text-muted-foreground md:grid ${rowColumns}`}>
        <span aria-hidden="true" /><span>{t('opportunity')}</span><span>{t('stage')}</span><span>{t('nextStep')}</span><span>{t('lastActivity')}</span><span className="sr-only">{t('open')}</span>
      </div>
      <ul aria-label={t('listLabel')} className="min-w-0 divide-y">
        {shown.map(card => <OpportunityRow key={card.job_revision_id} projectId={projectId} card={card} locale={locale} onMove={(row, stage) => void move(row, stage)} updatedLabel={updatedLabel} />)}
      </ul>
    </section> : <div role="group" className="grid min-w-0 gap-4" aria-label={t('boardLabel')}>
      <p className="text-xs text-muted-foreground max-md:hidden">{t('dragHint')}</p>
      <div className="grid min-w-0 gap-4 md:grid-flow-col md:auto-cols-[minmax(15rem,1fr)] md:overflow-x-auto md:pb-3 scroll-visible">
        {ACTIVE_STAGES.map(stage => {
          const inStage = shown.filter(card => card.stage === stage);
          return <section key={stage} aria-labelledby={`stage-${stage}`} {...zone(stage)} className={cn('grid min-w-0 content-start gap-2 rounded-xl bg-muted p-2', zoneClass(stage))}>
            <h2 id={`stage-${stage}`} className="flex h-8 items-center gap-2 px-2 text-sm font-semibold"><span className="stage-dot" data-app-stage={stage} aria-hidden="true" />{stageLabel[stage][locale]}<span className="ms-auto font-normal tabular-nums text-muted-foreground">{inStage.length}</span></h2>
            {inStage.length ? inStage.map(item) : <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{dragId ? t('dropHere') : t('noApplications')}</p>}
          </section>;
        })}
      </div>
      <section aria-labelledby="closed-stage-heading" className="min-w-0 rounded-xl bg-muted p-2">
        <h2 id="closed-stage-heading"><button type="button" aria-expanded={closedOpen} onClick={() => setClosedOpen(value => !value)} className="flex min-h-11 w-full items-center lg:min-h-10 justify-between gap-2 text-start text-sm font-semibold">{t('closedStages')} ({closed.length})<ChevronDown className={cn('size-5 text-muted-foreground transition-transform', closedOpen && 'rotate-180')} aria-hidden="true" /></button></h2>
        {(closedOpen || dragId) && <div className="mt-3 grid gap-3">
          {dragId && <div className="grid gap-2 sm:grid-cols-2">{CLOSED_STAGES.map(stage => <div key={stage} {...zone(stage)} className={cn('rounded-lg border border-dashed px-3 py-4 text-center text-sm font-medium', zoneClass(stage))}>{t('dropTo', { stage: stageLabel[stage][locale] })}</div>)}</div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{closed.map(item)}</div>
        </div>}
      </section>
    </div>}
  </div>;
}
