import { scan, restore } from './engine.js';
import { SessionVault, newSessionId, encryptBackup, decryptBackup } from './vault.js';

const $ = id => document.getElementById(id);
const prompt = $('prompt');
const vault = new SessionVault();
const isExtension = location.protocol === 'chrome-extension:' && Boolean(globalThis.chrome?.runtime?.id);
const allowedProviderOrigins = new Set(['https://chatgpt.com', 'https://gemini.google.com']);
let result = null, restoredText = null, target = null, busy = false, generation = 0;
let demoMode = false, receiptStatus = 'Awaiting your review';
let toastTimer, backupMode = 'save', backupFile = null;

function toast(message) { $('toast').textContent = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 5000); }
function fail(message) { $('error-banner').textContent = message; $('error-banner').hidden = false; $('announcement').textContent = message; }
function clearError() { $('error-banner').hidden = true; $('error-banner').textContent = ''; }
function invalidateReply() { restoredText = null; $('copy-restored').disabled = true; $('restored').textContent = 'Your restored reply will appear here.'; $('restore-note').textContent = 'Keep tokens unchanged in the AI reply.'; }
function setJudgeStage(stage, note) {
  if (!demoMode) return;
  $('judge-guide').hidden = false; $('judge-note').textContent = note;
  for (const item of document.querySelectorAll('[data-demo-step]')) {
    const number = Number(item.dataset.demoStep); item.className = number < stage ? 'done' : number === stage ? 'active' : '';
  }
}
function renderReceipt(status = receiptStatus) {
  if (!result) { $('privacy-receipt').hidden = true; return; }
  receiptStatus = status; $('privacy-receipt').hidden = false;
  $('receipt-detected').textContent = String(result.findings.length);
  $('receipt-masked').textContent = result.blocked ? '—' : String(result.vault.size);
  $('receipt-originals').textContent = result.blocked ? 'Not shared' : String([...result.vault.values()].filter(value => result.masked.includes(value)).length);
  $('receipt-status').textContent = status;
  $('receipt-categories').textContent = [...new Set(result.findings.map(finding => finding.label))].join(' · ') || 'None detected';
  $('privacy-receipt').classList.toggle('blocked', result.blocked);
}
function updateActions() {
  const approved = result && !result.blocked && $('reviewed').checked;
  $('copy').disabled = !approved || busy;
  $('insert').disabled = !approved || !target || busy;
  $('read-reply').disabled = !target || busy;
  $('restore').disabled = !$('session-select').value || busy;
  $('demo-reply').disabled = !$('session-select').value || busy;
  $('save-vault').disabled = !vault.list().length || busy;
  $('connect').disabled = busy;
  $('provider-choice').disabled = busy || Boolean(target);
  $('disconnect').disabled = busy;
  $('load-vault').disabled = busy;
}
function updateSessions(selected = $('session-select').value) {
  const sessions = vault.list(); $('session-select').replaceChildren();
  if (!sessions.length) $('session-select').add(new Option('No scans saved in memory', ''));
  sessions.forEach((s, index) => $('session-select').add(new Option(`Scan ${index + 1} · ${s.count} details · ${new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, s.id)));
  if (sessions.some(s => s.id === selected)) $('session-select').value = selected;
  else if (sessions.length) $('session-select').value = sessions.at(-1).id;
  $('vault-count').textContent = `${sessions.length} scan${sessions.length === 1 ? '' : 's'} in memory`;
  updateActions();
}
function invalidateScan() {
  result?.vault.clear(); result = null;
  receiptStatus = 'Awaiting your review'; $('privacy-receipt').hidden = true;
  $('reviewed').checked = false; $('reviewed').disabled = true;
  $('empty-preview').hidden = false; $('masked').hidden = true; $('masked').replaceChildren(); $('blocked-view').hidden = true;
  $('result-badge').textContent = 'Awaiting scan'; $('result-badge').className = 'badge';
  $('findings').replaceChildren(); $('finding-count').textContent = '0';
  const message = document.createElement('p'); message.className = 'muted small'; message.textContent = 'Checks IDs, contact details, common secret patterns, and names after introductions. Add private terms for anything else.'; $('findings').append(message);
  $('scan-summary').textContent = 'Your next scan appears here';
  $('preview-note').textContent = 'Review every preview. Local rules can miss personal data.';
  $('char-count').textContent = `${prompt.value.length.toLocaleString()} / 30,000`;
  updateActions();
}
function closeBackup() { generation++; $('vault-dialog').close(); $('passphrase').value = ''; $('confirm-passphrase').value = ''; backupFile = null; $('backup-file').value = ''; busy = false; $('submit-vault').disabled = false; updateActions(); }
function wipe(message = '') {
  generation++; vault.clear(); prompt.value = ''; $('custom').value = ''; $('reply').value = ''; demoMode = false; $('judge-guide').hidden = true;
  closeBackup(); $('clear-dialog').close(); clearError(); invalidateScan(); invalidateReply(); updateSessions(); updateConnection();
  if (message) toast(message);
}
function ensureActive() {
  if (vault.expire()) { wipe('Session auto-cleared after 15 minutes of inactivity.'); return false; }
  vault.touch(); return true;
}
function updateConnection() {
  $('connection-controls').hidden = !isExtension; $('insert').hidden = !isExtension; $('read-reply').hidden = !isExtension;
  $('connect').hidden = Boolean(target); $('disconnect').hidden = !target;
  if (target) { $('connection-title').textContent = `${target.name} · connected for this chat`; $('connection-note').textContent = 'Approved preview only. Inserting makes it visible to this website, but does not click Send. Disconnect removes MIRAGE’s site access.'; }
  else if (isExtension) { $('connection-title').textContent = 'Private Chrome side panel'; $('connection-note').textContent = 'Choose the active chatbot and connect. Chrome may ask you to allow access to that site only.'; $('connect').textContent = 'Connect current chat'; }
  else { $('connection-title').textContent = location.hostname === '127.0.0.1' || location.hostname === 'localhost' ? 'Local workspace' : 'Browser workspace'; $('connection-note').textContent = 'Text is processed in your browser. Install the Chrome extension for the private side panel and chat insertion.'; }
  updateActions();
}
function renderMasked(text) {
  const output = $('masked'); output.replaceChildren(); let cursor = 0;
  for (const m of text.matchAll(/\[MG_[A-Z0-9]+_[A-Z]+_\d+\]/g)) {
    output.append(document.createTextNode(text.slice(cursor, m.index))); const mark = document.createElement('mark'); mark.textContent = m[0]; output.append(mark); cursor = m.index + m[0].length;
  }
  output.append(document.createTextNode(text.slice(cursor)));
}
function scanPrompt() {
  if (!ensureActive()) return; clearError(); invalidateScan();
  if (!prompt.value.trim()) { fail('Add a prompt before scanning.'); prompt.focus(); return; }
  const id = newSessionId();
  try {
    result = scan(prompt.value, $('custom').value.split('\n'), id);
    if (!result.blocked) { vault.add(id, result.vault); updateSessions(id); }
  } catch (error) { invalidateScan(); fail(error.message); return; }
  $('empty-preview').hidden = true; $('finding-count').textContent = result.findings.length; $('findings').replaceChildren();
  const groups = new Map();
  for (const f of result.findings) { const key = `${f.type}:${f.note}`; if (!groups.has(key)) groups.set(key, { ...f, count: 0 }); groups.get(key).count++; }
  for (const f of groups.values()) {
    const chip = document.createElement('div'); chip.className = `finding${f.blocked ? ' secret' : ''}`;
    const label = document.createElement('strong'); label.textContent = `${f.blocked ? 'Blocked' : result.blocked ? 'Detected' : 'Masked'} · ${f.label} × ${f.count}`;
    const detail = document.createElement('span'); detail.textContent = f.note; chip.append(label, detail); $('findings').append(chip);
  }
  if (!result.findings.length) { const p = document.createElement('p'); p.className = 'small muted'; p.textContent = 'No matches found. This is not a guarantee. Add missed names, addresses or other private details as custom terms.'; $('findings').append(p); }
  $('result-badge').textContent = result.blocked ? 'Secret detected' : 'Review required'; $('result-badge').className = `badge ${result.blocked ? 'red' : 'green'}`;
  $('scan-summary').textContent = result.blocked ? 'Remove secrets and scan again' : `${result.vault.size} unique details masked · Review before sharing`;
  if (result.blocked) { $('blocked-view').hidden = false; $('preview-note').textContent = 'Copy and insertion are blocked. Remove the secret, then scan again.'; }
  else { $('masked').hidden = false; renderMasked(result.masked); $('reviewed').disabled = false; }
  renderReceipt(result.blocked ? 'Sharing blocked' : 'Awaiting your review');
  setJudgeStage(result.blocked ? 2 : 3, result.blocked ? 'MIRAGE found a credential and stopped the workflow before sharing.' : 'The scan ran locally. Review the masked preview and approve it.');
  $('announcement').textContent = result.blocked ? 'Secret detected. Copy and insertion blocked.' : `Scan complete. ${result.findings.length} matches. Review the preview and check the approval box.`;
  invalidateReply(); updateActions();
}
prompt.addEventListener('input', () => { ensureActive(); clearError(); invalidateScan(); });
$('custom').addEventListener('input', () => { ensureActive(); clearError(); invalidateScan(); });
$('reviewed').addEventListener('change', () => { if (ensureActive()) { const approved = $('reviewed').checked; $('result-badge').textContent = approved ? 'Reviewed by you' : 'Review required'; renderReceipt(approved ? 'Approved by user' : 'Awaiting your review'); setJudgeStage(approved ? 4 : 3, approved ? 'Only the masked preview is now eligible to leave MIRAGE. Insert it or copy it manually.' : 'Review the complete preview before sharing.'); updateActions(); } });
$('scan').addEventListener('click', scanPrompt);
function loadScenario(text, privateTerms, message) {
  if (!ensureActive()) return; prompt.value = text; $('custom').value = privateTerms; clearError(); invalidateScan(); prompt.focus(); toast(message);
}
function loadOnboardingScenario() {
  loadScenario("Hi, I'm Ananya Deshmukh, and I recently joined Nexora Labs as a software engineering intern. HR asked me to confirm my employee ID NX-INT-2041, DOB 14/08/2004, PAN DEMOX1234A, phone number +91 98765 43210, and email address ananya.demo@student.example. Please draft a professional reply confirming these details and asking whether my onboarding documents are complete.", '', 'Synthetic onboarding scenario loaded. Scan to see the mask.');
}
$('sample-personal').addEventListener('click', loadOnboardingScenario);
$('sample-health').addEventListener('click', () => loadScenario("Hi, I'm Rohan Mehta. My patient ID is CLINIC-4821. Please draft a follow-up note after a chronic migraine consultation. Ask the clinic to send the care plan to rohan.demo@patient.example or call +91 91234 56789. My home address is 42 Lotus Park, Pune.", 'chronic migraine', 'Synthetic patient scenario loaded with one custom health term.'));
$('sample-secret').addEventListener('click', () => loadScenario('I am configuring our demo attendance API before tomorrow’s review, but authentication keeps failing. Here is the relevant .env snippet:\nAPI_KEY=sk-demo-1234567890abcdefghijklmnop\nDB_PASSWORD=CampusDemo!2026\nCan you find the configuration problem?', '', 'Synthetic credential-leak scenario loaded.'));
$('start-demo').addEventListener('click', () => { demoMode = true; loadOnboardingScenario(); setJudgeStage(2, 'A believable synthetic onboarding request is ready. Click Scan & mask.'); $('judge-guide').scrollIntoView?.({ block: 'start' }); });
$('exit-demo').addEventListener('click', () => { demoMode = false; $('judge-guide').hidden = true; toast('Judge mode closed. Your current session remains available.'); });
async function copyText(text, onSuccess) { try { await navigator.clipboard.writeText(text); onSuccess?.(); toast('Copied to clipboard.'); } catch { fail('Clipboard access failed. Select the visible preview and copy it manually.'); } }
$('copy').addEventListener('click', () => { if (ensureActive() && result && !result.blocked && $('reviewed').checked) copyText(result.masked, () => { renderReceipt('Masked preview copied'); setJudgeStage(5, 'The safe preview is ready for an AI. Use a real reply or Try a sample reply below.'); }); });
$('reply').addEventListener('input', () => { ensureActive(); invalidateReply(); });
$('session-select').addEventListener('change', () => { ensureActive(); invalidateReply(); updateActions(); });
$('demo-reply').addEventListener('click', () => {
  if (!ensureActive()) return;
  try {
    const tokens = [...vault.get($('session-select').value).keys()];
    const token = type => tokens.find(value => value.includes(`_${type}_`));
    const person = token('PERSON'), employeeId = token('RECORDID'), dob = token('DOB'), pan = token('PAN'), phone = token('PHONE'), email = token('EMAIL');
    $('reply').value = person && employeeId && dob && pan && phone && email
      ? `Local demo response — no AI call was made.\n\nSubject: Confirmation of onboarding details\n\nHello HR Team,\n\nThank you for the update. I’m writing to confirm my onboarding details:\n\nName: ${person}\nEmployee ID: ${employeeId}\nDate of birth: ${dob}\nPAN: ${pan}\nPhone: ${phone}\nEmail: ${email}\n\nPlease let me know whether my onboarding documents are complete or if you need anything else from me.\n\nBest regards,\n${person}`
      : `Local demo response — no AI call was made.\n\nHere are the protected details referenced in this draft:\n${tokens.length ? tokens.join('\n') : 'No tokens in this scan.'}\n\nPlease review the response before using it.`;
    invalidateReply(); setJudgeStage(5, 'This local response preserves MIRAGE tokens. Click Restore details to complete the privacy loop.'); toast('Realistic local reply loaded. Click Restore details.');
  }
  catch (error) { fail(error.message); }
});
$('restore').addEventListener('click', () => {
  if (!ensureActive()) return; clearError();
  if (!$('reply').value.trim()) { fail('Paste or fetch an AI reply first.'); $('reply').focus(); return; }
  try {
    const restored = restore($('reply').value, vault.get($('session-select').value));
    restoredText = restored.text; $('restored').textContent = restored.text; $('copy-restored').disabled = false;
    $('restore-note').textContent = restored.unknown.length ? `${restored.unknown.length} unknown token(s) remain. Choose the matching scan. Tokens changed by the AI cannot be restored.` : 'Restored inside MIRAGE. Copying this reply includes the original details.';
    $('announcement').textContent = $('restore-note').textContent;
    setJudgeStage(6, 'Demo complete: sensitive values stayed local, the AI-facing text used tokens, and the reply was restored inside MIRAGE.');
  } catch (error) { fail(error.message); }
});
$('copy-restored').addEventListener('click', () => { if (ensureActive() && restoredText !== null) copyText(restoredText); });
$('clear').addEventListener('click', () => { if (vault.list().length || prompt.value || $('reply').value || $('custom').value) $('clear-dialog').showModal(); else wipe('Session is already empty.'); });
$('cancel-clear').addEventListener('click', () => $('clear-dialog').close());
$('confirm-clear').addEventListener('click', () => { wipe('Session cleared. Encrypted backup files and clipboard are unchanged.'); prompt.focus(); });

async function bridge(type, text, expectedOrigin) {
  const response = await chrome.runtime.sendMessage({ type, ...(target ? { tabId: target.tabId, url: target.url } : {}), ...(expectedOrigin ? { expectedOrigin } : {}), ...(text === undefined ? {} : { text }) });
  if (!response?.ok) throw new Error(response?.error || 'Chat connection unavailable. Copy and paste manually.'); return response;
}
async function runBridge(action) {
  if (!ensureActive() || busy) return; const epoch = generation; clearError(); busy = true; updateActions();
  try { await action(epoch); } catch (error) { if (epoch === generation) { target = null; updateConnection(); fail(error.message); } }
  finally { if (epoch === generation) { busy = false; updateActions(); } }
}
$('connect').addEventListener('click', () => runBridge(async epoch => {
  const expectedOrigin = $('provider-choice').value;
  if (!allowedProviderOrigins.has(expectedOrigin)) throw new Error('Choose ChatGPT or Gemini.');
  // Called directly from the button gesture. Chrome shows a clear, site-specific
  // permission prompt and grants nothing if the user declines.
  const permission = { origins: [`${expectedOrigin}/*`] };
  const granted = await chrome.permissions.request(permission);
  if (!granted) throw new Error(`Chrome access to ${new URL(expectedOrigin).hostname} was not granted. Allow it when Chrome asks, or use manual copy and paste.`);
  try {
    const r = await bridge('connect', undefined, expectedOrigin);
    if (epoch === generation) { target = r.target; updateConnection(); toast(`Connected to ${target.name}. Review your preview before inserting.`); }
  } catch (error) { await chrome.permissions.remove(permission); throw error; }
}));
$('disconnect').addEventListener('click', async () => {
  if (!target || busy) return;
  const origin = target.permissionOrigin; target = null; clearError(); updateConnection();
  try {
    if (allowedProviderOrigins.has(origin)) await chrome.permissions.remove({ origins: [`${origin}/*`] });
    toast('Disconnected. MIRAGE site access was removed.');
  } catch { fail('Disconnected, but Chrome could not remove the site grant. Remove MIRAGE site access from the extension settings.'); }
});
$('provider-choice').addEventListener('change', clearError);
$('insert').addEventListener('click', () => {
  if (!result || result.blocked || !$('reviewed').checked || !target) return;
  const approvedText = result.masked;
  runBridge(async epoch => { await bridge('insert', approvedText); if (epoch === generation) { renderReceipt('Masked preview inserted'); setJudgeStage(5, 'The masked draft is in the chatbot. Send it yourself, then fetch the reply or use the local sample.'); toast('Masked draft inserted. Check it in the chatbot, then send when ready.'); } });
});
$('read-reply').addEventListener('click', () => {
  const priorReply = $('reply').value;
  runBridge(async epoch => { const r = await bridge('read'); if (epoch !== generation) return; if ($('reply').value !== priorReply) { fail('Your reply changed while reading the chat. Fetch again when ready.'); return; } $('reply').value = r.text; invalidateReply(); setJudgeStage(5, 'The tokenized AI reply is back inside MIRAGE. Click Restore details.'); toast('Latest visible AI reply loaded. Choose its scan, then restore.'); });
});

function openBackup(mode, file = null) {
  if (!ensureActive()) return; backupMode = mode; backupFile = file; $('vault-error').textContent = ''; $('passphrase').value = ''; $('confirm-passphrase').value = '';
  $('vault-dialog-title').textContent = mode === 'save' ? 'Encrypt your session' : 'Unlock your backup';
  $('vault-dialog-note').textContent = mode === 'save' ? 'Use a unique passphrase. MIRAGE cannot recover a forgotten passphrase. The backup contains only token mappings.' : 'Unlock on this device. Mappings merge into memory; nothing is uploaded.';
  $('confirm-wrap').hidden = mode !== 'save'; $('confirm-passphrase').required = mode === 'save'; $('submit-vault').textContent = mode === 'save' ? 'Encrypt & download' : 'Unlock backup';
  $('vault-dialog').showModal(); $('passphrase').focus();
}
$('save-vault').addEventListener('click', () => openBackup('save'));
$('load-vault').addEventListener('click', () => { if (ensureActive()) $('backup-file').click(); });
$('backup-file').addEventListener('change', () => { const file = $('backup-file').files[0]; if (!file) return; if (file.size > 2_000_000) { fail('Backup must be smaller than 2 MB.'); $('backup-file').value = ''; return; } openBackup('load', file); });
$('cancel-vault').addEventListener('click', closeBackup);
$('vault-dialog').addEventListener('cancel', event => { event.preventDefault(); closeBackup(); });
$('vault-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!ensureActive() || busy) return;
  const passphrase = $('passphrase').value;
  if (backupMode === 'save' && passphrase !== $('confirm-passphrase').value) { $('vault-error').textContent = 'Passphrases do not match.'; return; }
  const epoch = generation; busy = true; $('submit-vault').disabled = true; $('vault-error').textContent = 'Working locally…'; updateActions();
  $('passphrase').value = ''; $('confirm-passphrase').value = '';
  try {
    if (backupMode === 'save') {
      const encrypted = await encryptBackup(vault.snapshot(), passphrase);
      if (epoch !== generation) return;
      const url = URL.createObjectURL(new Blob([encrypted], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `mirage-vault-${new Date().toISOString().slice(0,10)}.mirage`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      closeBackup(); toast('Encrypted backup downloaded. Keep your passphrase separately.');
    } else {
      const decrypted = await decryptBackup(await backupFile.text(), passphrase);
      if (epoch !== generation) return;
      vault.import(decrypted); updateSessions(); closeBackup(); toast('Backup unlocked into memory. Choose a scan to restore its reply.');
    }
  } catch (error) { if (epoch === generation) $('vault-error').textContent = error.message; }
  finally { if (epoch === generation) { busy = false; $('submit-vault').disabled = false; updateActions(); } }
});
setInterval(() => { if (vault.expire()) wipe('Session auto-cleared after 15 minutes of inactivity.'); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && vault.expire()) wipe('Session auto-cleared while MIRAGE was inactive.'); });
window.addEventListener('pagehide', () => wipe());
// Restoring a back-forward cached page must never resurrect its old approval.
window.addEventListener('pageshow', event => { if (event.persisted) wipe('Returned to an empty session. Unlock a backup to restore earlier scans.'); });
window.addEventListener('beforeunload', event => { if (vault.list().length) { event.preventDefault(); event.returnValue = ''; } });
updateSessions(); updateConnection();
