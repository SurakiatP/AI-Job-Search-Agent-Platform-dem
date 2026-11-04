import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

function CrashNotice() {
  const { t } = useTranslation();
  return <main id="main-content" className="grid min-h-dvh place-items-center bg-background p-6">
    <Alert severity="error" role="alert" className="w-full max-w-xl" action={<Button variant="outline" size="sm" className="bg-card" onClick={() => window.location.reload()}><RotateCw className="size-4" aria-hidden="true" />{t('pages.reloadPage')}</Button>}>
      <p className="font-medium">{t('pages.crashTitle')}</p>
      <p className="text-muted-foreground">{t('pages.crashBody')}</p>
    </Alert>
  </main>;
}

// Without this, one render error unmounts the whole app and leaves a blank white page.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(error); }
  render() { return this.state.failed ? <CrashNotice /> : this.props.children; }
}
