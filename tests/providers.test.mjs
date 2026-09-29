import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { getProvider, providerAction } from '../extension/providers.js';
import { scan } from '../extension/engine.js';

function fixture(html, url = 'https://chatgpt.com/c/demo') {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{}]; };
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  Object.defineProperty(window.HTMLElement.prototype, 'isContentEditable', { get() { return this.getAttribute('contenteditable') === 'true'; } });
  window.document.execCommand = (command, _, text) => {
    assert.equal(command, 'insertText'); const editor = window.document.activeElement;
    editor.textContent = text; editor.dispatchEvent(new window.Event('input', { bubbles: true })); return true;
  };
  const action = window.eval('(' + providerAction.toString() + ')');
  return { dom, window, run: (operation, payload, expected = url) => action(operation, payload, expected, getProvider(url)) };
}
test('provider origin allowlist rejects lookalikes, subdomains and insecure protocols', () => {
  assert.equal(getProvider('https://chatgpt.com/c/demo').name, 'ChatGPT'); assert.equal(getProvider('https://gemini.google.com/app').name, 'Gemini');
  for (const url of ['http://chatgpt.com', 'https://chatgpt.com.evil.test', 'https://evil.test/?https://chatgpt.com', 'https://www.chatgpt.com', 'file:///tmp/chatgpt.com']) assert.equal(getProvider(url), null);
});
test('insertion uses only masked text and does not click submit or send a form', () => {
  const f = fixture('<form><textarea id="prompt-textarea"></textarea><button>Send</button></form>');
  let submitted = false, clicked = false;
  f.window.document.querySelector('form').addEventListener('submit', () => { submitted = true; });
  f.window.document.querySelector('button').addEventListener('click', () => { clicked = true; });
  const r = scan('Email private@example.com', [], 'TEST'); assert.equal(f.run('insert', r.masked).ok, true);
  assert.equal(f.window.document.querySelector('textarea').value, r.masked); assert.ok(!f.window.document.body.innerHTML.includes('private@example.com'));
  assert.equal(submitted, false); assert.equal(clicked, false); f.dom.window.close();
});
test('contenteditable ChatGPT and Gemini adapters insert literal text', () => {
  for (const [html,url] of [['<div id="prompt-textarea" contenteditable="true" tabindex="0"></div>', 'https://chatgpt.com/'], ['<rich-textarea><div contenteditable="true" tabindex="0"></div></rich-textarea>', 'https://gemini.google.com/app']]) {
    const f = fixture(html, url); assert.equal(f.run('insert', '<img src=x> [MG_TEST_PERSON_1]').ok, true);
    assert.equal(f.window.document.querySelectorAll('img').length, 0); f.dom.window.close();
  }
});
test('existing drafts are preserved and unknown layouts stop without guessing', () => {
  for (const html of ['<textarea id="prompt-textarea">User draft</textarea>', '<textarea></textarea>', '<textarea id="prompt-textarea"></textarea><textarea id="prompt-textarea"></textarea>', '<textarea id="prompt-textarea" disabled></textarea>', '<textarea id="prompt-textarea" hidden></textarea>']) {
    const f = fixture(html); const before = f.window.document.body.innerHTML;
    assert.equal(f.run('insert', 'masked text').ok, false); assert.equal(f.window.document.body.innerHTML, before); f.dom.window.close();
  }
});
test('navigation between connect and execution prevents insertion', () => {
  const f = fixture('<textarea id="prompt-textarea"></textarea>'); assert.equal(f.run('insert', 'masked', 'https://chatgpt.com/c/other').ok, false);
  assert.equal(f.window.document.querySelector('textarea').value, ''); f.dom.window.close();
});
test('latest visible assistant reply is read without writing restored values', () => {
  const f = fixture('<div data-message-author-role="user">User input</div><div data-message-author-role="assistant">First</div><div data-message-author-role="assistant">Hi [MG_TEST_PERSON_1]</div><div data-message-author-role="assistant" hidden>Hidden</div>');
  const before = f.window.document.body.innerHTML; const r = f.run('read', null);
  assert.equal(r.text, 'Hi [MG_TEST_PERSON_1]'); assert.equal(f.window.document.body.innerHTML, before); f.dom.window.close();
});
test('missing and oversized replies do not guess other page content', () => {
  for (const html of ['<p>Other private website content</p>', `<div data-message-author-role="assistant">${'a'.repeat(60001)}</div>`]) {
    const f = fixture(html); assert.equal(f.run('read', null).ok, false); f.dom.window.close();
  }
});

// Worker module runs against a narrow API double; no browser permissions are granted.
globalThis.chrome = { sidePanel: { setPanelBehavior: async () => {} }, runtime: { onMessage: { addListener: () => {} } } };
const { handleMessage } = await import('../extension/background.js');
function api(tab = { id: 7, url: 'https://chatgpt.com/c/demo' }) {
  const calls = [];
  return { calls, runtime: { id: 'TESTEXT', getURL: path => `chrome-extension://TESTEXT/${path}` }, tabs: { query: async () => [tab] }, scripting: { executeScript: async input => { calls.push(input); return [{ result: { ok: true } }]; } } };
}
const sender = { id: 'TESTEXT', url: 'chrome-extension://TESTEXT/index.html#workspace' };
test('worker rejects webpage, other extension and unknown extension page messages', async () => {
  for (const bad of [{ id: 'TESTEXT', url: 'https://chatgpt.com/' }, { id: 'OTHER', url: sender.url }, { id: 'TESTEXT', url: 'chrome-extension://TESTEXT/privacy.html' }]) {
    const fake = api(); assert.equal((await handleMessage({ type: 'connect' }, bad, fake)).ok, false); assert.equal(fake.calls.length, 0);
  }
});
test('worker enforces the connected tab and chat URL before any script runs', async () => {
  for (const message of [{ type: 'insert', tabId: 8, url: 'https://chatgpt.com/c/demo', text: 'masked' }, { type: 'read', tabId: 7, url: 'https://chatgpt.com/c/other' }]) {
    const fake = api(); assert.equal((await handleMessage(message, sender, fake)).ok, false); assert.equal(fake.calls.length, 0);
  }
});
test('worker injects only into the top frame in the isolated world', async () => {
  const fake = api(); const masked = scan('private@example.com', [], 'TEST').masked;
  assert.equal((await handleMessage({ type: 'insert', tabId: 7, url: 'https://chatgpt.com/c/demo', text: masked }, sender, fake)).ok, true);
  assert.equal(fake.calls[0].world, 'ISOLATED'); assert.deepEqual(fake.calls[0].target.frameIds, [0]); assert.equal(fake.calls[0].args[1], masked);
  assert.ok(!JSON.stringify(fake.calls).includes('private@example.com'));
});
test('worker never executes adapters on unsupported sites', async () => {
  const fake = api({ id: 7, url: 'https://example.com' }); assert.equal((await handleMessage({ type: 'connect' }, sender, fake)).ok, false); assert.equal(fake.calls.length, 0);
});
