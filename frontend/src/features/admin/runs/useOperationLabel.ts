import { useTranslation } from 'react-i18next';

/** Task name in the UI language. The app already translates its operations (common: workspace.operations); unknown names show as they are. */
export function useOperationLabel() {
  const { t } = useTranslation('admin-runs');
  const common = useTranslation('common').t;
  return (operation: string) => (operation === 'document_ocr' ? t('operation.document_ocr') : common(`workspace.operations.${operation}`, { defaultValue: operation }));
}
