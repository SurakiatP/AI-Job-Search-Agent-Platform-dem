import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppProviders } from './app/providers';
import { AppRoutes } from './app/router';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><AppProviders><BrowserRouter><AppRoutes /></BrowserRouter></AppProviders></StrictMode>);
