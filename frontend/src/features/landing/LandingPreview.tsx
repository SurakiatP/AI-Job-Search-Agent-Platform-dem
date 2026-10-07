import { Download } from 'lucide-react';
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
        {p.jobs.map(j => <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3" key={j.title}>
          <div className="grid min-w-0 gap-0.5 text-sm"><span className="font-medium [overflow-wrap:anywhere]">{j.title}</span><span className="text-muted-foreground [overflow-wrap:anywhere]">{j.place}</span><span className="text-muted-foreground [overflow-wrap:anywhere]">{j.salary}</span></div>
          <FitScore score={j.score} locale={locale} />
        </div>)}
      </Card>
    </TabsContent>
  </Tabs>;
}
