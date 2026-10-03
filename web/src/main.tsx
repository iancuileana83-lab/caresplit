import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ViewAsProvider } from './lib/view-as';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ViewAsProvider>
        <App />
      </ViewAsProvider>
    </BrowserRouter>
  </StrictMode>,
);
