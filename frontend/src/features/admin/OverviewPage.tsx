import { LayoutDashboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';

export function OverviewPage() {
  const { t } = useTranslation('admin-overview');
  const shell = useTranslation('admin-shell').t;
  return <><PageHeader icon={LayoutDashboard} title={t('title')} lede={t('lede')} /><p className="mt-8 text-muted-foreground">{shell('comingSoon')}</p></>;
}
