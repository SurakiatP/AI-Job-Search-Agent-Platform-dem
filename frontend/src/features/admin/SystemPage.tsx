import { Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';

export function SystemPage() {
  const { t } = useTranslation('admin-system');
  const shell = useTranslation('admin-shell').t;
  return <><PageHeader icon={Server} title={t('title')} lede={t('lede')} /><p className="mt-8 text-muted-foreground">{shell('comingSoon')}</p></>;
}
