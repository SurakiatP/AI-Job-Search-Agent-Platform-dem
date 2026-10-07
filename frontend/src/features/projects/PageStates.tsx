import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';

export function LoadingState() {
  const { t } = useTranslation();
  return <div className="mx-auto grid max-w-3xl gap-4 py-4" role="status" aria-live="polite">
    <span className="sr-only">{t('pages.loading', { defaultValue: 'Loading…' })}</span>
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-24 w-full" />
  </div>;
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return <section className="mx-auto my-12 flex max-w-xl flex-col items-start gap-3" role="alert"><p>{t('pages.loadError', { defaultValue: 'We could not load this information.' })}</p><Button variant="outline" onClick={onRetry}>{t('pages.retry', { defaultValue: 'Try again' })}</Button></section>;
}

export function MissingResource() {
  const { t } = useTranslation();
  return <EmptyState title={t('pages.notFound', { defaultValue: 'We could not find that item.' })} description={t('pages.noProject', { defaultValue: 'Choose or create a project to continue.' })}><Button asChild><Link to="/app/projects">{t('pages.backProjects', { defaultValue: 'Back to projects' })}</Link></Button></EmptyState>;
}

export function EmptyPage({ title, description, href, action }: { title: string; description: string; href: string; action: string }) {
  return <EmptyState title={title} description={description}><Button asChild><Link to={href}>{action}</Link></Button></EmptyState>;
}
