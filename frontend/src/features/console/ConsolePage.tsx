import { useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentsTab } from './AgentsTab';
import { ApprovalsTab } from './ApprovalsTab';
import { ConnectTab } from './ConnectTab';
import { TimelineTab } from './TimelineTab';
import { copy } from './copy';

const TABS = ['timeline', 'approvals', 'agents', 'connect'] as const;
type Tab = (typeof TABS)[number];

export function ConsolePage() {
  const { projectId = '' } = useParams();
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : 'timeline';
  return <div className="grid gap-6">
    <div className="min-w-0"><h1 className="break-words text-2xl font-semibold">{c.title}</h1><p className="text-sm text-muted-foreground">{c.subtitle}</p></div>
    <Tabs value={tab} onValueChange={value => setParams({ tab: value }, { replace: true })}>
      <TabsList className="max-w-full">{TABS.map(key => <TabsTrigger key={key} value={key}>{c.tabs[key]}</TabsTrigger>)}</TabsList>
      <TabsContent value="timeline"><TimelineTab projectId={projectId} locale={locale} c={c} /></TabsContent>
      <TabsContent value="approvals"><ApprovalsTab projectId={projectId} locale={locale} c={c} /></TabsContent>
      <TabsContent value="agents"><AgentsTab projectId={projectId} locale={locale} c={c} /></TabsContent>
      <TabsContent value="connect"><ConnectTab c={c} /></TabsContent>
    </Tabs>
  </div>;
}
