// A failed module must leave a visible, non-actionable state rather than an inert UI.
const startup = document.getElementById('startup-status');
import('./app.js').then(() => { startup.hidden = true; }).catch(error => {
  startup.hidden = false;
  startup.textContent = `MIRAGE could not start (${error.name}: ${error.message}). Reload this page. If it persists, update Chrome or reload the extension. No prompt was shared.`;
});
