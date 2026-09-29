import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as engine from '../extension/engine.js';
import * as vault from '../extension/vault.js';

const html = await readFile(new URL('../extension/index.html', import.meta.url), 'utf8');
const script = (await readFile(new URL('../extension/app.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
function setup(extension = false, permissionGranted = true) {
  const dom = new JSDOM(html, { url: extension ? 'chrome-extension://TEST/index.html' : 'http://127.0.0.1:4173', runScripts: 'outside-only' });
  const w = dom.window, writes = [], messages = [], permissionRequests = [], permissionRemovals = [];
  Object.defineProperty(w, 'crypto', { value: globalThis.crypto });
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async value => { writes.push(value); } } });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  if (extension) w.chrome = {
    runtime: { id: 'TEST', sendMessage: async message => { messages.push(message); const origin = message.expectedOrigin || 'https://chatgpt.com'; const name = origin.includes('gemini') ? 'Gemini' : 'ChatGPT'; return message.type === 'connect' ? { ok: true, target: { tabId: 1, url: `${origin}/c/demo`, name, permissionOrigin: origin } } : { ok: true, text: 'Sample reply' }; } },
    permissions: {
      request: async request => { permissionRequests.push(request); return permissionGranted; },
      remove: async request => { permissionRemovals.push(request); return true; }
    }
  };
  w.__dependencies = { ...engine, ...vault };
  w.eval('const { scan, restore, SessionVault, newSessionId, encryptBackup, decryptBackup } = __dependencies;\n' + script);
  const el = id => w.document.getElementById(id);
  const input = (id, text) => { el(id).value = text; el(id).dispatchEvent(new w.Event('input', { bubbles: true })); };
  const approve = () => { el('reviewed').checked = true; el('reviewed').dispatchEvent(new w.Event('change')); };
  return { dom, w, el, input, approve, writes, messages, permissionRequests, permissionRemovals, close: () => dom.window.close() };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('preview approval gates copying and edits revoke the approval', async () => {
  const f = setup(); f.el('sample-personal').click(); f.el('scan').click();
  assert.equal(f.el('copy').disabled, true); assert.equal(f.el('reviewed').disabled, false);
  f.el('copy').click(); await tick(); assert.equal(f.writes.length, 0);
  f.approve(); f.el('copy').click(); await tick(); assert.equal(f.writes.length, 1);
  assert.match(f.writes[0], /\[MG_/); assert.ok(!f.writes[0].includes('Ananya Deshmukh'));
  f.input('prompt', 'new draft'); assert.equal(f.el('copy').disabled, true); assert.equal(f.el('reviewed').checked, false); f.close();
});
test('detected secrets disable review, copy and insertion', () => {
  const f = setup(true); f.el('sample-secret').click(); f.el('scan').click();
  assert.equal(f.el('blocked-view').hidden, false); assert.equal(f.el('reviewed').disabled, true); assert.equal(f.el('copy').disabled, true); assert.equal(f.el('insert').disabled, true);
  assert.equal(f.el('session-select').options.length, 1); assert.equal(f.el('session-select').value, ''); f.close();
});
test('editing a new draft retains the earlier scan for reply restoration', () => {
  const f = setup(); f.input('prompt', 'Email first@example.com'); f.el('scan').click(); const old = f.el('masked').textContent;
  const firstId = f.el('session-select').value;
  f.input('prompt', 'Email second@example.com'); f.el('scan').click(); assert.equal(f.el('session-select').options.length, 2);
  f.el('session-select').value = firstId; f.el('session-select').dispatchEvent(new f.w.Event('change'));
  f.input('reply', old); f.el('restore').click(); assert.equal(f.el('restored').textContent, 'Email first@example.com'); f.close();
});
test('onboarding demo masks realistic fields and restores a formatted local reply', () => {
  const f = setup(); f.el('sample-personal').click();
  assert.match(f.el('prompt').value, /software engineering intern/); f.el('scan').click();
  assert.equal(f.el('finding-count').textContent, '4');
  for (const value of ['Ananya Deshmukh', 'DEMOX1234A', '+91 98765 43210', 'ananya.demo@student.example']) assert.ok(!f.el('masked').textContent.includes(value));
  f.el('demo-reply').click(); assert.match(f.el('reply').value, /Subject: Confirmation of onboarding details/); assert.ok(!f.el('reply').value.includes('Ananya Deshmukh'));
  f.el('restore').click();
  for (const value of ['Ananya Deshmukh', 'DEMOX1234A', '+91 98765 43210', 'ananya.demo@student.example']) assert.ok(f.el('restored').textContent.includes(value));
  f.close();
});
test('HTML and script-shaped text is rendered literally in preview and replies', () => {
  const f = setup(); f.input('prompt', '<img src=x onerror=alert(1)> a@example.com'); f.el('scan').click();
  assert.equal(f.el('masked').querySelector('img'), null);
  f.input('reply', '<script>alert(1)</script> ' + f.el('masked').textContent); f.el('restore').click();
  assert.equal(f.el('restored').querySelector('script'), null); assert.match(f.el('restored').textContent, /a@example.com/); f.close();
});
test('clear requires confirmation and discards original text and all mapping choices', () => {
  const f = setup(); f.el('sample-personal').click(); f.el('scan').click(); f.el('clear').click();
  assert.equal(f.el('clear-dialog').open, true); assert.ok(f.el('prompt').value);
  f.el('cancel-clear').click(); assert.ok(f.el('prompt').value);
  f.el('clear').click(); f.el('confirm-clear').click();
  assert.equal(f.el('prompt').value, ''); assert.equal(f.el('session-select').value, ''); assert.equal(f.el('restore').disabled, true); assert.equal(f.el('copy').disabled, true); f.close();
});
test('side-panel bridge receives approved masked text, never original values', async () => {
  const f = setup(true); f.el('connect').click(); await tick(); await tick();
  assert.equal(JSON.stringify(f.permissionRequests), JSON.stringify([{ origins: ['https://chatgpt.com/*'] }]));
  f.el('sample-personal').click(); f.el('scan').click(); f.approve(); f.el('insert').click(); await tick();
  const message = f.messages.find(x => x.type === 'insert'); assert.ok(message); assert.match(message.text, /\[MG_/);
  assert.ok(!JSON.stringify(f.messages).includes('Ananya Deshmukh')); assert.ok(!JSON.stringify(f.messages).includes('DEMOX1234A')); f.close();
});
test('connection asks only for the selected site and handles denial without messaging the worker', async () => {
  const denied = setup(true, false); denied.el('provider-choice').value = 'https://gemini.google.com'; denied.el('connect').click(); await tick(); await tick();
  assert.equal(JSON.stringify(denied.permissionRequests), JSON.stringify([{ origins: ['https://gemini.google.com/*'] }])); assert.equal(denied.messages.length, 0); assert.match(denied.el('error-banner').textContent, /not granted/); denied.close();
  const connected = setup(true); connected.el('connect').click(); await tick(); await tick(); connected.el('disconnect').click(); await tick();
  assert.equal(JSON.stringify(connected.permissionRemovals), JSON.stringify([{ origins: ['https://chatgpt.com/*'] }])); assert.equal(connected.el('connect').hidden, false); connected.close();
});
test('backup dialog cancels without retaining passphrase fields', () => {
  const f = setup(); f.el('sample-personal').click(); f.el('scan').click(); f.el('save-vault').click();
  f.el('passphrase').value = 'test-passphrase'; f.el('confirm-passphrase').value = 'test-passphrase'; f.el('cancel-vault').click();
  assert.equal(f.el('vault-dialog').open, false); assert.equal(f.el('passphrase').value, ''); assert.equal(f.el('confirm-passphrase').value, ''); f.close();
});
test('pagehide and back-forward restoration discard approval and originals', () => {
  const f = setup(); f.el('sample-personal').click(); f.el('scan').click(); f.approve();
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide'));
  assert.equal(f.el('prompt').value, ''); assert.equal(f.el('copy').disabled, true); assert.equal(f.el('session-select').value, ''); f.close();
});
test('encrypted backup UI saves, clears, unlocks and restores an earlier reply', async () => {
  const f = setup(); const downloads = [];
  f.w.URL.createObjectURL = blob => { downloads.push(blob); return 'blob:test'; };
  f.w.URL.revokeObjectURL = () => {};
  f.w.HTMLAnchorElement.prototype.click = () => {};
  const waitFor = async condition => { for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('UI operation did not finish'); };
  f.input('prompt', 'Email demo@example.com'); f.el('scan').click(); const maskedReply = f.el('masked').textContent;
  f.el('save-vault').click(); f.el('passphrase').value = 'test-only backup passphrase'; f.el('confirm-passphrase').value = 'test-only backup passphrase';
  f.el('vault-form').dispatchEvent(new f.w.Event('submit', { cancelable: true }));
  await waitFor(() => downloads.length === 1);
  const ciphertext = await new Promise((resolve, reject) => { const reader = new f.w.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsText(downloads[0]); });
  assert.ok(!ciphertext.includes('demo@example.com')); assert.equal(f.el('passphrase').value, '');
  f.el('clear').click(); f.el('confirm-clear').click(); assert.equal(f.el('session-select').value, '');
  Object.defineProperty(f.el('backup-file'), 'files', { configurable: true, value: [{ size: ciphertext.length, text: async () => ciphertext }] });
  f.el('backup-file').dispatchEvent(new f.w.Event('change'));
  f.el('passphrase').value = 'test-only backup passphrase'; f.el('vault-form').dispatchEvent(new f.w.Event('submit', { cancelable: true }));
  await waitFor(() => !f.el('vault-dialog').open);
  f.input('reply', maskedReply); f.el('restore').click(); assert.equal(f.el('restored').textContent, 'Email demo@example.com'); f.close();
});
test('cancelling encryption prevents its late result from downloading', async () => {
  const f = setup(); let downloads = 0;
  f.w.URL.createObjectURL = () => { downloads++; return 'blob:test'; };
  f.el('sample-personal').click(); f.el('scan').click(); f.el('save-vault').click();
  f.el('passphrase').value = 'test-only backup passphrase'; f.el('confirm-passphrase').value = 'test-only backup passphrase';
  f.el('vault-form').dispatchEvent(new f.w.Event('submit', { cancelable: true })); f.el('cancel-vault').click();
  await new Promise(resolve => setTimeout(resolve, 600)); assert.equal(downloads, 0); assert.equal(f.el('vault-dialog').open, false); f.close();
});
