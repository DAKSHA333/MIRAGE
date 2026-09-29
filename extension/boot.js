// A failed module must leave a visible, non-actionable state rather than an inert UI.
const startup = document.getElementById('startup-status');
import('./app.js').then(() => { startup.hidden = true; }).catch(error => {
  startup.hidden = false;
  startup.textContent = `MIRAGE could not start (${error.name}: ${error.message}). Reload this page. If it persists, update Chrome or reload the extension. No prompt was shared.`;
});

// The hosted workspace is installable and offline-capable. Chrome extension
// pages keep using their reviewed MV3 service worker instead.
if ((location.protocol === 'https:' || ['127.0.0.1', 'localhost'].includes(location.hostname)) && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}));
}
