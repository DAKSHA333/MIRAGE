export const PROVIDERS = Object.freeze({
  'https://chatgpt.com': { name: 'ChatGPT', composer: '#prompt-textarea', replies: '[data-message-author-role="assistant"]' },
  'https://gemini.google.com': { name: 'Gemini', composer: 'rich-textarea [contenteditable="true"]', replies: 'model-response .model-response-text' }
});
export function getProvider(url) { try { return PROVIDERS[new URL(url).origin] ?? null; } catch { return null; } }
// Serialized by Chrome: no closure or vault access, and never clicks Send.
export function providerAction(operation, payload, expectedUrl, config) {
  if (location.href !== expectedUrl || !['https://chatgpt.com', 'https://gemini.google.com'].includes(location.origin)) return { ok: false, error: 'The chat changed. Connect to the current tab again.' };
  const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[aria-hidden="true"]');
  if (operation === 'read') {
    const reply = [...document.querySelectorAll(config.replies)].filter(visible).at(-1);
    if (!reply) return { ok: false, error: 'No supported AI reply found. Paste the reply into MIRAGE manually.' };
    const text = reply.innerText;
    if (!text?.trim() || text.length > 60000) return { ok: false, error: 'Reply is empty or too long. Paste a shorter reply manually.' };
    return { ok: true, text };
  }
  if (operation !== 'insert' || typeof payload !== 'string' || payload.length > 200000 || !payload.trim()) return { ok: false, error: 'Invalid insertion request.' };
  const editors = [...document.querySelectorAll(config.composer)].filter(visible);
  if (editors.length !== 1) return { ok: false, error: 'Could not identify one supported chat input. Copy the masked prompt manually.' };
  const editor = editors[0];
  if (editor.disabled || editor.getAttribute('aria-disabled') === 'true') return { ok: false, error: 'The chatbot input is disabled.' };
  const text = () => editor.tagName === 'TEXTAREA' ? editor.value : editor.innerText;
  if (text()?.trim()) return { ok: false, error: 'The chatbot already contains a draft. MIRAGE will not overwrite it. Clear it yourself and try again.' };
  editor.focus();
  if (editor.tagName === 'TEXTAREA') {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, payload);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (editor.isContentEditable) {
    const selection = window.getSelection(), range = document.createRange();
    range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range);
    if (!document.execCommand('insertText', false, payload)) return { ok: false, error: 'The editor rejected insertion. Copy the masked prompt manually.' };
  } else return { ok: false, error: 'Unsupported editor. Copy the masked prompt manually.' };
  if (text()?.replace(/\r\n/g, '\n').trim() !== payload.replace(/\r\n/g, '\n').trim()) return { ok: false, error: 'The editor changed the inserted text. Check the chatbot draft before sending.' };
  return { ok: true };
}
