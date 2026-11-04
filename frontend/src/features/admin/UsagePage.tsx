import { Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';

export function UsagePage() {
  const { t } = useTranslation('admin-usage');
  const shell = useTranslation('admin-shell').t;
  return <><PageHeader icon={Receipt} title={t('title')} lede={t('lede')} /><p className="mt-8 text-muted-foreground">{shell('comingSoon')}</p></>;
}
