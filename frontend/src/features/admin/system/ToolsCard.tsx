import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { AdminToolDescriptor } from '@/lib/api-types';
import { SectionCard } from '../../settings/Field';

export function ToolsCard({ tools }: { tools: AdminToolDescriptor[] }) {
  const { t } = useTranslation('admin-system');
  return <SectionCard title={t('tools.title')} description={t('tools.description')}>
    {tools.length === 0 ? <p className="text-sm text-muted-foreground">{t('tools.empty')}</p>
      : <ul className="divide-y rounded-lg border">
        {tools.map(tool => <li key={tool.name} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
          <code className="break-all text-sm font-medium">{tool.name}</code>
          <p className="text-sm text-muted-foreground">{tool.description}</p>
          <Badge variant="secondary" className="justify-self-start font-mono sm:justify-self-end">{tool.required_capability}</Badge>
        </li>)}
      </ul>}
  </SectionCard>;
}
