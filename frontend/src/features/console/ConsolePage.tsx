import { useParams, useSearchParams } from 'react-router';
import { PageBack } from '@/components/PageBack';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentsTab } from './AgentsTab';
import { ApprovalsTab } from './ApprovalsTab';
import { ConnectTab } from './ConnectTab';
import { TimelineTab } from './TimelineTab';
import { copy } from './copy';
import { Bot } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

const TABS = ['timeline', 'approvals', 'agents', 'connect'] as const;
type Tab = (typeof TABS)[number];

export function ConsolePage() {
  const { projectId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('th') ? 'th' : 'en';
  const c = copy[locale];
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : 'timeline';
  return <div className="grid min-w-0 gap-6 lg:gap-8">
    <div className="grid gap-1">
      <PageBack to={`/app/projects/${projectId}/overview`}>{t('nav.overview')}</PageBack>
      <PageHeader icon={Bot} title={c.title} lede={c.subtitle} />
    </div>
    <Tabs className="min-w-0" value={tab} onValueChange={value => setParams({ tab: value }, { replace: true })}>
      <TabsList className="max-w-full flex-nowrap overflow-x-auto">{TABS.map(key => <TabsTrigger key={key} value={key}>{c.tabs[key]}</TabsTrigger>)}</TabsList>
      <TabsContent value="timeline"><TimelineTab projectId={projectId} locale={locale} c={c} /></TabsContent>
      <TabsContent value="approvals"><ApprovalsTab projectId={projectId} locale={locale} c={c} /></TabsContent>
      <TabsContent value="agents"><AgentsTab projectId={projectId} locale={locale} c={c} /></TabsContent>
      <TabsContent value="connect"><ConnectTab c={c} lang={locale} projectId={projectId} onIssue={() => setParams({ tab: 'agents' }, { replace: true })} /></TabsContent>
    </Tabs>
  </div>;
}
