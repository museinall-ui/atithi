import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { injectBaseStyles } from './tokens.js';
import App from './App.jsx';

injectBaseStyles();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
