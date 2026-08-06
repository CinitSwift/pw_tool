import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/reset.css';
import './styles/tokens.css';

document.title = '陪玩小工具';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
