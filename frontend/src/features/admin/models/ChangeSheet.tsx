import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleCheckBig, CircleDot, CircleX, FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { admin } from '@/lib/api';
import type { AdminBenchmark, AdminEffort, AdminRegisteredModel, AdminTaskSetting } from '@/lib/api-types';
import { CaseGrid, MetricPair, Sheet, StepPane, Stepper, TypedConfirm, type CaseStatus } from '../ui';
import { CONFIRM, POLL_MS, TESTABLE, emptyPrice, errText, needsPrice, perCall, priceBody, priceState, score, taskName, type Pick, type PriceDraft } from './lib';
import { ModelPicker } from './ModelPicker';

type Phase = 'choose' | 'list' | 'test' | 'decide' | 'done';
const STEP: Record<Phase, number> = { choose: 0, list: 0, test: 1, decide: 2, done: 3 };

export interface ChangeSheetProps {
  open: boolean;
  onClose: () => void;
  /** The task to change; null opens the "one model for every task" mode. */
  task: AdminTaskSetting | null;
  tasks: AdminTaskSetting[];
  registered: AdminRegisteredModel[];
  /** Called after a model was registered or a task changed, so the page reloads its lists. */
  onChanged: () => void;
}

/** Choose a model and effort, test the pair, decide. One flow for one task; in all-tasks mode the pair is chosen once and each task runs the same flow. */
export function ChangeSheet({ open, onClose, task, tasks, registered, onChanged }: ChangeSheetProps) {
  const { t } = useTranslation('admin-models');
  const all = task == null;
  const first = task ?? tasks[0];
  const [pick, setPick] = useState<Pick | null>(null);
  const [price, setPrice] = useState<PriceDraft>(emptyPrice);
  const [effort, setEffort] = useState<AdminEffort>(first && first.effort !== 'default' ? first.effort : 'low');
  const [phase, setPhase] = useState<Phase>('choose');
  const [target, setTarget] = useState<AdminTaskSetting | null>(task);
  const [bench, setBench] = useState<AdminBenchmark | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedOk, setTypedOk] = useState(false);
  const [applied, setApplied] = useState<Record<string, true>>({});
  const [lastApplied, setLastApplied] = useState<string | null>(null);
  const benchId = bench?.id;
  const benchLive = bench != null && (bench.status === 'queued' || bench.status === 'running');

  // Poll the test every 2 s while this sheet is open and the test is not finished.
  const poll = useRef<(b: AdminBenchmark) => void>(() => {});
  poll.current = b => { setBench(b); if (b.status === 'done') setPhase('decide'); };
  useEffect(() => {
    if (phase !== 'test' || !benchId || !benchLive || !open) return;
    const id = window.setInterval(() => { admin.benchmark(benchId).then(b => poll.current(b), () => { /* keep polling; a blip must not end the test */ }); }, POLL_MS);
    return () => window.clearInterval(id);
  }, [phase, benchId, benchLive, open]);

  const ready = pick != null && (!needsPrice(pick) || priceState(price) === 'ok');
  const testable = target ? TESTABLE.has(target.operation) : all ? false : TESTABLE.has(task!.operation);
  const verdict = bench?.verdict ?? 'na';
  const name = target ? taskName(t, target.operation) : '';

  /** Register the model first when it is new; a price typed by hand goes with it. */
  async function register() {
    if (!pick || pick.registered) return;
    await admin.addModel({ model: pick.id, ...(needsPrice(pick) ? priceBody(price) : {}) });
    setPick({ ...pick, registered: true });
    onChanged();
  }
  async function begin(op: AdminTaskSetting) {
    if (!pick) return;
    setBusy(true); setError(null); setTypedOk(false); setBench(null); setTarget(op);
    try {
      await register();
      if (!TESTABLE.has(op.operation)) { setPhase('decide'); return; }
      const b = await admin.startBenchmark({ operation: op.operation, model: pick.id, effort });
      setBench(b); setPhase('test');
    } catch (e) { setError(errText(t, e)); } finally { setBusy(false); }
  }
  async function apply() {
    if (!pick || !target) return;
    setBusy(true); setError(null);
    try {
      const body = { model: pick.id, effort, benchmark_id: bench?.id ?? null, ...(verdict === 'green' ? {} : { confirm: CONFIRM }) };
      await admin.setTask(target.operation, body);
      onChanged();
      if (all) { setApplied(a => ({ ...a, [target.operation]: true })); setLastApplied(name); setBench(null); setPhase('list'); } else setPhase('done');
    } catch (e) { setError(errText(t, e)); } finally { setBusy(false); }
  }
  const backToChoose = () => { setPhase('choose'); setBench(null); setError(null); };

  const cases = useMemo<CaseStatus[]>(() => {
    const list = bench?.cases ?? [];
    return list.length ? list.map(c => c.state) : Array.from({ length: 20 }, () => 'pending' as const);
  }, [bench]);
  const bad = cases.filter(c => c === 'bad').length;
  const okN = cases.filter(c => c === 'ok').length;
  const done = okN + bad;

  const footer = (() => {
    if (phase === 'choose') {
      const single = !all;
      const note = !pick ? t('change.pickFirst') : needsPrice(pick) && priceState(price) !== 'ok' ? t('change.needPrice') : all ? '' : testable ? t('change.testNote') : t('change.noTestNote');
      return <>
        <span className="me-auto text-sm text-muted-foreground" role="status">{note}</span>
        <Button variant="outline" onClick={onClose}>{t('change.cancel')}</Button>
        {single
          ? <Button disabled={!ready} busy={busy} onClick={() => begin(task!)}><FlaskConical className="size-4" aria-hidden="true" />{testable ? t('change.startTest') : t('change.continue')}</Button>
          : <Button disabled={!ready} busy={busy} onClick={async () => { setBusy(true); setError(null); try { await register(); setPhase('list'); } catch (e) { setError(errText(t, e)); } finally { setBusy(false); } }}>{t('change.continue')}</Button>}
      </>;
    }
    if (phase === 'list') return <Button onClick={onClose}>{t('change.done')}</Button>;
    if (phase === 'test') return <Button variant="outline" onClick={onClose}>{t('close')}</Button>;
    if (phase === 'decide') return <>
      <Button variant="outline" className="me-auto" onClick={all ? () => { setPhase('list'); setBench(null); setError(null); } : backToChoose}>{all ? t('change.backToList') : t('change.back')}</Button>
      {verdict === 'green'
        ? <Button busy={busy} onClick={apply}><CircleCheckBig className="size-4" aria-hidden="true" />{t('change.useFor', { task: name })}</Button>
        : <Button variant="destructive" busy={busy} disabled={!typedOk} onClick={apply}>{t('change.useAnyway')}</Button>}
    </>;
    return <Button onClick={onClose}>{t('change.done')}</Button>;
  })();

  const s = bench?.summary, b = bench?.baseline;
  const drop = s && b ? b.quality - s.quality : 0;
  const redDrop = verdict === 'red' && drop > 2;
  const verdictText = verdict === 'green'
    ? s && b ? t('change.verdictGreen', { dir: t(s.quality >= b.quality ? 'change.up' : 'change.down'), value: score(Math.abs(s.quality - b.quality)) }) : t('change.verdictGreenNoBase', { value: s ? score(s.quality) : '—' })
    : verdict === 'red' ? (redDrop ? t('change.verdictRedDrop', { value: score(drop) }) : t('change.verdictRedErrors'))
    : bench ? t('change.verdictNa') : t('change.verdictNaNoSet');
  const verdictSub = verdict === 'green' ? t('change.greenSub', { task: name }) : verdict === 'red' ? t('change.redSub') : t('change.naSub');
  const tone = verdict === 'green' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive';
  const sec = (v: number) => t('change.sec', { v: v.toFixed(1) });
  const pairKey = `${benchId ?? 'none'}`;
  const effortName = t(`effort.${effort}`);

  return <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }} closeLabel={t('close')}
    title={all ? t('change.titleAll') : t('change.title', { task: taskName(t, task!.operation) })}
    subtitle={<Stepper steps={[t('steps.choose'), t('steps.test'), t('steps.decide')]} current={STEP[phase]} />} footer={footer}>
    {error ? <Alert severity="error">{error}</Alert> : null}

    <StepPane active={phase === 'choose'}>
      {first ? <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted px-3.5 py-3 text-sm">
        <CircleDot className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1"><div className="text-xs text-muted-foreground">{t('change.inUse')}</div><strong className="[overflow-wrap:anywhere]">{first.model}</strong> · {t(`effort.${first.effort}`)}</div>
        {!all && first.quality != null ? <span className="text-muted-foreground tabular-nums">{t('change.score', { value: score(first.quality) })}</span> : null}
      </div> : null}
      {all ? <p className="text-sm text-muted-foreground">{t('change.allIntro')}</p> : null}
      <ModelPicker registered={registered} pick={pick} onPick={p => { setPick(p); setPrice(emptyPrice); }} price={price} onPrice={setPrice} effort={effort} onEffort={setEffort} />
    </StepPane>

    <StepPane active={phase === 'list'}>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted px-3.5 py-3 text-sm">
        <CircleDot className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1"><strong className="[overflow-wrap:anywhere]">{pick?.id}</strong> · {effortName}</div>
        <Button size="sm" variant="ghost" onClick={backToChoose}>{t('change.allBack')}</Button>
      </div>
      {lastApplied ? <Alert severity="success">{t('change.doneBody', { task: lastApplied, model: pick?.id, effort: effortName })}</Alert> : null}
      <ul className="divide-y rounded-xl border">
        {tasks.map(row => {
          const same = pick != null && row.model === pick.id && row.effort === effort;
          const rowName = taskName(t, row.operation);
          return <li key={row.operation} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
            <span className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{rowName}{!TESTABLE.has(row.operation) ? <span className="block text-xs font-normal text-muted-foreground">{t('change.allNoTest')}</span> : null}</span>
            {applied[row.operation] ? <Badge variant="success">{t('change.allApplied')}</Badge>
              : same ? <Badge variant="muted">{t('change.allInUse')}</Badge>
              : <Button size="sm" variant="outline" busy={busy && target?.operation === row.operation} disabled={busy} aria-label={t('change.allTestFor', { model: pick?.id, task: rowName })} onClick={() => begin(row)}>
                {TESTABLE.has(row.operation) ? t('change.allTest') : t('change.allApplyNoTest')}</Button>}
          </li>;
        })}
      </ul>
    </StepPane>

    <StepPane active={phase === 'test'}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><div className="text-xs text-muted-foreground">{t('change.testing')}</div><strong className="[overflow-wrap:anywhere]">{pick?.id} / {effortName}</strong></div>
        <Badge variant="muted" className="tabular-nums">{t('change.testSet')}</Badge>
      </div>
      <Progress value={(done / Math.max(cases.length, 1)) * 100} />
      <CaseGrid cases={cases} ariaLabel={t('change.casesLabel', { done, total: cases.length, bad })} />
      <p role="status" className="text-sm text-muted-foreground tabular-nums">{bench?.status === 'failed' ? '' : bench?.status === 'queued' || done === 0 && !cases.includes('running') ? t('change.queued') : t('change.running', { n: Math.min(done + 1, cases.length), total: cases.length, ok: okN })}</p>
      {bench?.status === 'failed'
        ? <Alert severity="error" action={<Button size="sm" variant="outline" onClick={backToChoose}>{t('change.back')}</Button>}>{t('change.testFailed')}</Alert>
        : <Alert severity="info">{t('change.closeNote')}</Alert>}
    </StepPane>

    <StepPane active={phase === 'decide'}>
      <div className={`grid grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-2xl px-4 py-4 ${tone}`}>
        {verdict === 'green' ? <CircleCheckBig className="size-7" aria-hidden="true" /> : <CircleX className="size-7" aria-hidden="true" />}
        <div className="text-foreground"><b className="block text-[17px] font-semibold leading-snug">{verdictText}</b><span className="text-sm text-muted-foreground">{verdictSub}</span></div>
      </div>
      {s && b ? <div className="rounded-2xl border px-4 py-4">
        <MetricPair label={t('change.mQuality')} unit={t('change.mQualityUnit')} oldLabel={t('change.now')} newLabel={t('change.new')} oldValue={b.quality} newValue={s.quality} better="higher" format={score}
          betterText={t('change.better')} worseText={t('change.worse')} animateKey={pairKey} />
        <MetricPair label={t('change.mTime')} unit={t('change.mTimeUnit')} oldLabel={t('change.now')} newLabel={t('change.new')} oldValue={b.p50_seconds} newValue={s.p50_seconds} better="lower" format={sec}
          betterText={t('change.better')} worseText={t('change.worse')} index={1} animateKey={pairKey} />
        {s.cost_per_call_usd != null && b.cost_per_call_usd != null
          ? <MetricPair label={t('change.mCost')} unit={t('change.mCostUnit')} oldLabel={t('change.now')} newLabel={t('change.new')} oldValue={b.cost_per_call_usd} newValue={s.cost_per_call_usd} better="lower" deltaMode="percent" format={perCall}
            betterText={t('change.better')} worseText={t('change.worse')} index={2} animateKey={pairKey} /> : null}
      </div> : s ? <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-2xl border px-4 py-4 text-sm tabular-nums">
        <dt>{t('change.mQuality')}</dt><dd>{score(s.quality)}</dd><dt>{t('change.mTime')}</dt><dd>{sec(s.p50_seconds)}</dd><dt>{t('change.mCost')}</dt><dd>{perCall(s.cost_per_call_usd)}</dd>
      </dl> : null}
      {s ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>{t('change.errorsLine')} <strong className="tabular-nums">{s.errors} / {s.truncations}</strong></span>
        {b ? <span className="text-muted-foreground tabular-nums">{t('change.p95', { new: s.p95_seconds.toFixed(1), old: b.p95_seconds.toFixed(1) })}</span> : null}
      </div> : null}
      {bench ? <div className="grid gap-2"><h3 className="text-sm font-medium">{t('change.cases')}</h3><CaseGrid cases={cases} ariaLabel={t('change.casesLabel', { done, total: cases.length, bad })} /></div> : null}
      {verdict !== 'green' && phase === 'decide' ? <TypedConfirm key={`${target?.operation}:${benchId ?? 'none'}`} phrase={CONFIRM} label={t('change.confirmLabel')} matchedLabel={t('change.confirmed')} onMatchChange={setTypedOk} /> : null}
    </StepPane>

    <StepPane active={phase === 'done'}>
      <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-2xl bg-success/10 px-4 py-4 text-success">
        <CircleCheckBig className="size-7" aria-hidden="true" />
        <div className="text-foreground"><b className="block text-[17px] font-semibold leading-snug">{t('change.doneTitle')}</b><span className="text-sm text-muted-foreground">{t('change.doneBody', { task: name, model: pick?.id, effort: effortName })}</span></div>
      </div>
    </StepPane>
  </Sheet>;
}
