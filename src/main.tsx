import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { AppStoreProvider } from './store/AppStore';
import './styles/tokens.css';
import './styles/global.css';
import './styles/screens.css';

// Entry point: mount the app into <div id="root"> in index.html.
// BrowserRouter turns the URL into a route, AppStoreProvider shares app
// state, and ToastProvider lets any screen show a toast.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStoreProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AppStoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
