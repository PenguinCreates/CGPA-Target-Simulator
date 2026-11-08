import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isDevelopment = import.meta.env.DEV;
    const workerFile = import.meta.env.PROD ? 'service-worker.js' : 'dev-service-worker.js';
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}${workerFile}`, {
      scope: import.meta.env.BASE_URL,
    }).then(() => {
      if (!isDevelopment || navigator.serviceWorker.controller) return;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const reloadKey = 'studyline.offline-worker-reload';
        if (sessionStorage.getItem(reloadKey) === '1') return;
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
      }, { once: true });
    }).catch(() => {
      // Keep the app usable when service workers are unavailable.
    });
  });
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
