import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';

export function ModelsPage() {
  const { t } = useTranslation('admin-models');
  const shell = useTranslation('admin-shell').t;
  return <><PageHeader icon={SlidersHorizontal} title={t('title')} lede={t('lede')} /><p className="mt-8 text-muted-foreground">{shell('comingSoon')}</p></>;
}
