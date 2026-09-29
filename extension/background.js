import { getProvider, providerAction } from './providers.js';
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Only our extension page can request operations. No website message listener.
export async function handleMessage(message, sender, api = chrome) {
  if (sender.id !== api.runtime.id || sender.url?.split('#')[0] !== api.runtime.getURL('index.html')) return { ok: false, error: 'Unauthorized source.' };
  if (!message || !['connect', 'insert', 'read'].includes(message.type)) return { ok: false, error: 'Unsupported request.' };
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const provider = tab && getProvider(tab.url);
  if (!provider) return { ok: false, error: 'Open ChatGPT or Gemini, then click the MIRAGE toolbar icon to grant access to that tab.' };
  if (message.type === 'connect') return { ok: true, target: { tabId: tab.id, url: tab.url, name: provider.name } };
  if (message.tabId !== tab.id || message.url !== tab.url) return { ok: false, error: 'The active chat changed. Connect again before continuing.' };
  if (message.type === 'insert' && (typeof message.text !== 'string' || message.text.length > 200000 || !message.text.trim())) return { ok: false, error: 'Invalid masked prompt.' };
  const results = await api.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'ISOLATED', func: providerAction, args: [message.type, message.type === 'insert' ? message.text : null, tab.url, provider] });
  return results[0]?.result ?? { ok: false, error: 'The chat is unavailable. Copy and paste manually.' };
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(() => sendResponse({ ok: false, error: 'Tab access is unavailable. Click MIRAGE’s toolbar icon on the chatbot tab, then connect again.' }));
  return true;
});
