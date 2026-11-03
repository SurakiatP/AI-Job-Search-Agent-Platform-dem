import { Link } from 'react-router';
import { RotateCw } from 'lucide-react';
import { Alert } from '../../components/ui/alert';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { Spinner } from '../../components/ui/spinner';

export function LoadingState() {
  const { t } = useTranslation();
  return <div className="mx-auto grid max-w-3xl gap-4 py-4" role="status" aria-live="polite">
    <span className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />{t('pages.loading', { defaultValue: 'Loading…' })}</span>
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-24 w-full" />
  </div>;
}

// Load failure: an error Alert that says what failed and what to do, with a compact Retry beside it.
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return <Alert severity="error" className="mx-auto my-8 w-full max-w-xl" action={<Button variant="outline" size="sm" className="bg-card" onClick={onRetry}><RotateCw className="size-4" aria-hidden="true" />{t('pages.retry', { defaultValue: 'Try again' })}</Button>}>
    <p className="font-medium">{t('pages.loadError', { defaultValue: 'We could not load this information.' })}</p>
    <p className="text-muted-foreground">{t('pages.loadErrorHint', { defaultValue: 'The server did not answer. Check your connection, then try again.' })}</p>
  </Alert>;
}

export function MissingResource() {
  const { t } = useTranslation();
  return <EmptyState title={t('pages.notFound', { defaultValue: 'We could not find that item.' })} description={t('pages.noProject', { defaultValue: 'Choose or create a project to continue.' })}><Button asChild><Link to="/app/projects">{t('pages.backProjects', { defaultValue: 'Back to projects' })}</Link></Button></EmptyState>;
}

export function EmptyPage({ title, description, href, action }: { title: string; description: string; href: string; action: string }) {
  return <EmptyState title={title} description={description}><Button asChild><Link to={href}>{action}</Link></Button></EmptyState>;
}
