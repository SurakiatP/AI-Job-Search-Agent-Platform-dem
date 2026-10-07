import { AlertTriangle, Building2, Download, MapPin } from 'lucide-react';
import { useLocale } from '../../app/providers';
import { FitScore } from '../../components/FitScore';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { landingCopy, previewCopy } from './copy';

export function LandingPreview() {
  const { locale } = useLocale();
  const c = landingCopy[locale];
  const p = previewCopy[locale];
  const sample = <Badge variant="outline" className="shrink-0">ตัวอย่าง / Sample</Badge>;
  return <Tabs defaultValue="evaluate" className="min-w-0">
    <TabsList>
      <TabsTrigger value="evaluate">{c.tabs.evaluate}</TabsTrigger>
      <TabsTrigger value="documents">{c.tabs.documents}</TabsTrigger>
      <TabsTrigger value="search">{c.tabs.search}</TabsTrigger>
      <TabsTrigger value="console">{c.tabs.console}</TabsTrigger>
    </TabsList>
    <TabsContent value="evaluate">
      <Card className="grid gap-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-semibold leading-snug [overflow-wrap:anywhere]">{p.job}</p>{sample}
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
          <FitScore score={4.2} size="lg" locale={locale} />
          <ul className="grid gap-2 pl-4 text-sm text-muted-foreground [overflow-wrap:anywhere]">{p.reasons.map(r => <li className="list-disc" key={r}>{r}</li>)}</ul>
        </div>
        <div><StatusBadge status="completed" locale={locale} /></div>
      </Card>
    </TabsContent>
    <TabsContent value="documents">
      <Card className="grid gap-3 p-4 sm:p-6">
        <div className="flex justify-end">{sample}</div>
        {p.docs.map(d => <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3" key={d.name}>
          <div className="grid min-w-0 gap-1"><span className="font-medium [overflow-wrap:anywhere]">{d.name}</span><Badge variant="secondary" className="w-fit">{d.rev}</Badge></div>
          <Button variant="ghost" size="sm" disabled><Download aria-hidden="true" size={14} />{p.download}</Button>
        </div>)}
      </Card>
    </TabsContent>
    <TabsContent value="search">
      <Card className="grid gap-3 p-4 sm:p-6">
        <div className="flex justify-end">{sample}</div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ul className="grid min-w-0 content-start gap-3">
            {p.jobs.map((j, i) => <li key={j.title} className={`grid min-w-0 gap-2 rounded-xl border p-3 ${i === 0 ? 'border-primary bg-accent' : 'bg-card'}`}>
              <span className="font-semibold leading-snug [overflow-wrap:anywhere]">{j.title}</span>
              <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{j.company} · {j.place}</span>
              <span className="flex flex-wrap gap-2">
                <Badge variant="secondary">{j.mode}</Badge>
                <Badge variant="outline">{j.age}</Badge>
                {j.stale && <Badge variant="warning" className="gap-1"><AlertTriangle className="size-3" aria-hidden="true" />{p.staleLabel}</Badge>}
              </span>
            </li>)}
          </ul>
          <div className="grid min-w-0 content-start gap-3 rounded-xl border bg-card p-3">
            <div className="min-w-0">
              <p className="font-semibold leading-snug [overflow-wrap:anywhere]">{p.jobs[0].title}</p>
              <p className="mt-1 flex items-start gap-1 text-sm text-muted-foreground"><Building2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 [overflow-wrap:anywhere]">{p.jobs[0].company}</span></p>
              <p className="flex items-start gap-1 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 [overflow-wrap:anywhere]">{p.jobs[0].place}</span></p>
            </div>
            <div className="flex flex-wrap gap-2">{p.jobs[0].skills.map(k => <Badge key={k} variant="outline">{k}</Badge>)}</div>
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{p.jobs[0].blurb}</p>
            <Button size="sm" className="w-fit" disabled>{p.evaluate}</Button>
          </div>
        </div>
      </Card>
    </TabsContent>
    <TabsContent value="console">
      <Card className="grid gap-3 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-semibold">{p.consoleLabel}</p>{sample}
        </div>
        <ul className="grid gap-3">
          {p.runs.map(r => <li key={r.op + r.job} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3">
            <div className="grid min-w-0 gap-2">
              <span className="font-medium [overflow-wrap:anywhere]">{r.op}</span>
              <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{r.job}</span>
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={r.status} locale={locale} />
                <Badge variant="outline">{r.origin}</Badge>
              </span>
            </div>
            {r.score !== null && <FitScore score={r.score} locale={locale} />}
          </li>)}
        </ul>
      </Card>
    </TabsContent>
  </Tabs>;
}
