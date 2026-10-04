import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';

export function LoadingState() {
  const { t } = useTranslation();
  return <p className="page-state" role="status" aria-live="polite">{t('pages.loading', { defaultValue: 'Loading…' })}</p>;
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return <section className="page-state" role="alert"><p>{t('pages.loadError', { defaultValue: 'We could not load this information.' })}</p><Button onClick={onRetry}>{t('pages.retry', { defaultValue: 'Try again' })}</Button></section>;
}

export function MissingResource() {
  const { t } = useTranslation();
  return <EmptyState title={t('pages.notFound', { defaultValue: 'We could not find that item.' })} description={t('pages.noProject', { defaultValue: 'Choose or create a project to continue.' })}><Link className="button button-primary" to="/app/projects">{t('pages.backProjects', { defaultValue: 'Back to projects' })}</Link></EmptyState>;
}

export function EmptyPage({ title, description, href, action }: { title: string; description: string; href: string; action: string }) {
  return <EmptyState title={title} description={description}><Link className="button button-primary" to={href}>{action}</Link></EmptyState>;
}
