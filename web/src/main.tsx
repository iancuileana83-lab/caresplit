import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ViewAsProvider } from './lib/view-as';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ViewAsProvider>
          <App />
        </ViewAsProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
