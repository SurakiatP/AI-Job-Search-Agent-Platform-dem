import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';

export function RunsPage() {
  const { t } = useTranslation('admin-runs');
  const shell = useTranslation('admin-shell').t;
  return <><PageHeader icon={Activity} title={t('title')} lede={t('lede')} /><p className="mt-8 text-muted-foreground">{shell('comingSoon')}</p></>;
}
