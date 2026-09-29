import { getProvider, providerAction } from './providers.js';
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Only our extension page can request operations. No website message listener.
export async function handleMessage(message, sender, api = chrome) {
  if (sender.id !== api.runtime.id || sender.url?.split('#')[0] !== api.runtime.getURL('index.html')) return { ok: false, error: 'Unauthorized source.' };
  if (!message || !['connect', 'insert', 'read'].includes(message.type)) return { ok: false, error: 'Unsupported request.' };
  if (message.expectedOrigin && !['https://chatgpt.com', 'https://gemini.google.com'].includes(message.expectedOrigin)) return { ok: false, error: 'Unsupported chatbot selection.' };
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const provider = tab && getProvider(tab.url);
  if (!provider) return { ok: false, error: 'The active tab is not a supported ChatGPT or Gemini page. Open the selected chatbot in this Chrome window and try again.' };
  if (message.expectedOrigin && new URL(tab.url).origin !== message.expectedOrigin) return { ok: false, error: `The active tab is ${provider.name}, but MIRAGE is set to another chatbot. Choose ${provider.name} and connect again.` };
  if (message.type === 'connect') return { ok: true, target: { tabId: tab.id, url: tab.url, name: provider.name, permissionOrigin: new URL(tab.url).origin } };
  if (message.tabId !== tab.id || message.url !== tab.url) return { ok: false, error: 'The active chat changed. Connect again before continuing.' };
  if (message.type === 'insert' && (typeof message.text !== 'string' || message.text.length > 200000 || !message.text.trim())) return { ok: false, error: 'Invalid masked prompt.' };
  const results = await api.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'ISOLATED', func: providerAction, args: [message.type, message.type === 'insert' ? message.text : null, tab.url, provider] });
  return results[0]?.result ?? { ok: false, error: 'The chat is unavailable. Copy and paste manually.' };
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(() => sendResponse({ ok: false, error: 'Tab access is unavailable. Choose the chatbot, allow access when Chrome asks, and connect again.' }));
  return true;
});
