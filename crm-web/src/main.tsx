import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadBranding } from './config/brand';
import './index.css';

// Branding first, so the login page and menu show the installation's own name and logo.
loadBranding().finally(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
});
