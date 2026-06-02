import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Helper to show a fatal error overlay in the page for uncaught exceptions
function showFatalError(message: string) {
  try {
    const existing = document.getElementById('__fatal_error_overlay');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = '__fatal_error_overlay';
    el.style.position = 'fixed';
    el.style.left = '12px';
    el.style.right = '12px';
    el.style.top = '12px';
    el.style.bottom = '12px';
    el.style.zIndex = '999999';
    el.style.background = 'rgba(255,255,255,0.98)';
    el.style.border = '2px solid #900';
    el.style.padding = '16px';
    el.style.overflow = 'auto';
    el.style.color = '#900';
    el.style.fontFamily = 'monospace';
    el.innerText = `Fatal error\n\n${message}`;
    document.body.appendChild(el);
  } catch (e) {
    // ignore
    console.error('Failed to render fatal overlay', e);
  }
}

// Global handlers for uncaught errors / unhandled promise rejections
window.addEventListener('error', (ev) => {
  const err = ev.error || ev.message || String(ev);
  console.error('Uncaught error', err);
  showFatalError(err && err.stack ? err.stack : String(err));
});
window.addEventListener('unhandledrejection', (ev) => {
  console.error('Unhandled rejection', ev.reason);
  const r = ev.reason || 'Unhandled promise rejection';
  showFatalError(r && r.stack ? r.stack : String(r));
});

// expose the overlay helper so other modules can surface fatal errors programmatically
(window as any).__showFatalError = showFatalError;

const root = createRoot(document.getElementById('root')!);
try {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err: any) {
  console.error('Render error', err);
  showFatalError(err && err.stack ? err.stack : String(err));
}
