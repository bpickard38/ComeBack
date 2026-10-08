import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { AuthGate } from './store/AuthGate';
import './styles/tokens.css';
import './styles/global.css';
import './styles/screens.css';

// Entry point: mount the app into <div id="root"> in index.html.
// BrowserRouter turns the URL into a route, AuthGate makes you sign in and
// then shares app state, and ToastProvider lets any screen show a toast.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthGate>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthGate>
    </BrowserRouter>
  </StrictMode>,
);
