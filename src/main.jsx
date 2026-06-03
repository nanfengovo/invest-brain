import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'antd-mobile/es/global';
import './index.css';
import App from './App.jsx';

// Remove splash screen after app renders
function removeSplash() {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 500);
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App onReady={removeSplash} />
    </BrowserRouter>
  </StrictMode>
);
