import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AppProviders } from './app/providers';
import { AppShell } from './components/AppShell';
import { AppearanceControl } from './components/AppearanceControl';
import { EmptyState } from './components/EmptyState';
import './styles.css';

function Shell() {
  const { t } = useTranslation();
  return <AppShell><EmptyState title={t('workspaceTitle')} description={t('workspaceDescription')}><AppearanceControl /></EmptyState></AppShell>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><AppProviders><BrowserRouter><Shell /></BrowserRouter></AppProviders></StrictMode>);
