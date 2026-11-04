import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppProviders } from './app/providers';
import { AppRoutes } from './app/router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installValidationText } from './lib/validity';

installValidationText();

// After a deploy an open tab may ask for a page chunk that no longer exists; load the new version once instead of failing.
window.addEventListener('vite:preloadError', event => {
  try {
    if (sessionStorage.getItem('chunk-reload') === location.pathname) return; // already tried: let the error screen show
    sessionStorage.setItem('chunk-reload', location.pathname);
  } catch { return; }
  event.preventDefault();
  location.reload();
});

createRoot(document.getElementById('root')!).render(<StrictMode><AppProviders><BrowserRouter><ErrorBoundary><AppRoutes /></ErrorBoundary></BrowserRouter></AppProviders></StrictMode>);
