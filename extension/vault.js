// Private values live in extension-page memory. Explicit backups are encrypted.
export const IDLE_MS = 15 * 60 * 1000;
export const MAX_SESSIONS = 20;
const MAX_BYTES = 2_000_000;
const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const aad = encoder.encode('MIRAGE-VAULT-1');
export function newSessionId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function validate(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.sessions) || payload.sessions.length > MAX_SESSIONS) throw new Error('Invalid MIRAGE backup.');
  const ids = new Set(); let total = 0;
  for (const session of payload.sessions) {
    if (!session || typeof session.id !== 'string' || !/^[A-Z0-9]{1,64}$/.test(session.id) || ids.has(session.id) || !Number.isSafeInteger(session.createdAt) || session.createdAt < 0 || !Array.isArray(session.entries) || session.entries.length > 4000) throw new Error('Invalid MIRAGE backup.');
    ids.add(session.id);
    const tokens = new Set();
    for (const entry of session.entries) {
      if (!Array.isArray(entry) || entry.length !== 2) throw new Error('Invalid token entry.');
      const [token, value] = entry;
      if (typeof token !== 'string' || !new RegExp(`^\\[MG_${session.id}_(?:PERSON|PAN|AADHAAR|UPI|IFSC|EMAIL|PHONE|DOB|PASSPORT|BANKACCOUNT|RECORDID|ADDRESS|CUSTOM|PRIVATE)_\\d{1,4}\\]$`).test(token) || tokens.has(token) || typeof value !== 'string' || !value.length || value.length > 30000) throw new Error('Invalid token entry.');
      total += value.length; tokens.add(token);
      if (total > 500000) throw new Error('Backup exceeds the private-data limit.');
    }
  }
  return { version: 1, sessions: payload.sessions.map(s => ({ id: s.id, createdAt: s.createdAt, entries: s.entries.map(e => [...e]) })) };
}
export class SessionVault {
  constructor(now = () => Date.now()) { this.now = now; this.sessions = []; this.lastActivity = now(); }
  expire() { if (this.now() - this.lastActivity >= IDLE_MS) { this.clear(); return true; } return false; }
  touch() { const expired = this.expire(); this.lastActivity = this.now(); return expired; }
  add(id, map) {
    this.touch();
    if (this.sessions.length >= MAX_SESSIONS) throw new Error('20 scans are in memory. Save an encrypted backup, then clear this session.');
    const session = { id, createdAt: this.now(), entries: [...map].map(e => [...e]) };
    validate({ version: 1, sessions: [...this.sessions, session] }); this.sessions.push(session); return id;
  }
  list() { this.expire(); return this.sessions.map(s => ({ id: s.id, createdAt: s.createdAt, count: s.entries.length })); }
  get(id) { this.expire(); const session = this.sessions.find(s => s.id === id); if (!session) throw new Error('This scan is unavailable or expired. Unlock its backup or scan again.'); return new Map(session.entries); }
  snapshot() { this.expire(); return validate({ version: 1, sessions: this.sessions }); }
  import(payload) {
    this.expire(); const clean = validate(payload);
    const merged = new Map(this.sessions.map(s => [s.id, s]));
    for (const session of clean.sessions) {
      const existing = merged.get(session.id);
      if (existing && JSON.stringify(existing.entries) !== JSON.stringify(session.entries)) throw new Error('Backup contains a conflicting scan. Clear the session before importing it.');
      merged.set(session.id, session);
    }
    const combined = validate({ version: 1, sessions: [...merged.values()] });
    this.sessions = combined.sessions; this.lastActivity = this.now();
  }
  clear() { for (const s of this.sessions) { for (const e of s.entries) e[1] = ''; s.entries.length = 0; } this.sessions = []; this.lastActivity = this.now(); }
}
function base64(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function bytes(value, max) {
  if (typeof value !== 'string' || value.length > max * 2 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid backup encoding.');
  const result = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (result.length > max) throw new Error('Backup is too large.'); return result;
}
async function key(passphrase, salt, usage) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 256) throw new Error('Use a passphrase of 12–256 characters.');
  const raw = encoder.encode(passphrase);
  try {
    const material = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
  } finally { raw.fill(0); }
}
export async function encryptBackup(payload, passphrase) {
  const clean = validate(payload);
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(clean));
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, await key(passphrase, salt, 'encrypt'), plaintext);
    return JSON.stringify({ format: 'mirage-vault', version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, cipher: 'AES-256-GCM', salt: base64(salt), iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) });
  } finally { plaintext.fill(0); }
}
export async function decryptBackup(file, passphrase) {
  if (typeof file !== 'string' || file.length > MAX_BYTES) throw new Error('Backup must be smaller than 2 MB.');
  let envelope;
  try { envelope = JSON.parse(file); } catch { throw new Error('Not a valid MIRAGE backup file.'); }
  if (!envelope || envelope.format !== 'mirage-vault' || envelope.version !== 1 || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== ITERATIONS || envelope.cipher !== 'AES-256-GCM') throw new Error('Unsupported backup format.');
  const salt = bytes(envelope.salt, 16), iv = bytes(envelope.iv, 12), ciphertext = bytes(envelope.ciphertext, MAX_BYTES);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error('Invalid backup parameters.');
  let plaintext;
  try { plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, await key(passphrase, salt, 'decrypt'), ciphertext)); }
  catch { throw new Error('Could not unlock: incorrect passphrase or a damaged backup.'); }
  try { return validate(JSON.parse(new TextDecoder().decode(plaintext))); } finally { plaintext.fill(0); }
}
