import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// --pf-* token vars must load BEFORE tailwind so the v4 theme can reference them.
import './index.css';
// Tailwind v4 entry — --pf-* design tokens are bridged into the Tailwind theme.
import './main.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
