import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';

import './styles.css';

// Import the AI helper
import { initNemotronModel, isNemotronReady } from './utils/nemotronAI';

// Kick off model loading as soon as the page loads
(async () => {
  const ok = await initNemotronModel();
  if (ok) {
    console.log('🤖 Nemotron 2B model ready – AI will drive decisions');
  } else {
    console.log('🔁  Falling back to rule‑based decisions');
  }
})();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);


ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
