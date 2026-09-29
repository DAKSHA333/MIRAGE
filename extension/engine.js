// Shared, dependency-free local detector. No network, storage, or logging.
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
export function verhoeff(value) {
  const digits = value.replace(/\D/g, '');
  if (!/^[2-9]\d{11}$/.test(digits)) return false;
  return [...digits].reverse().reduce((c, n, i) => D[c][P[i % 8][Number(n)]], 0) === 0;
}
export function luhn(value) {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  [...digits].reverse().forEach((n, i) => { let v = Number(n); if (i % 2) { v *= 2; if (v > 9) v -= 9; } sum += v; });
  return sum % 10 === 0;
}
const reserved = /\[MG_[A-Z0-9]+_[A-Z]+_\d+\]/g;
const labels = { PERSON: 'Name', PAN: 'PAN', AADHAAR: 'Aadhaar', UPI: 'UPI ID', IFSC: 'IFSC', EMAIL: 'Email', PHONE: 'Phone', CUSTOM: 'Your private term', PRIVATE: 'Overlapping private details', SECRET: 'Secret', CARD: 'Payment card' };
// Canonicalize detection only; all reported offsets and restored values use the original.
function canonicalize(original) {
  let text = ''; const offsets = []; let index = 0;
  for (const character of original) {
    let normalized = character.normalize('NFKC');
    normalized = normalized.replace(/[०-९٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : digit <= '۹' ? 0x6f0 : 0x966)));
    for (let i = 0; i < normalized.length; i++) offsets.push([index, index + character.length]);
    text += normalized; index += character.length;
  }
  return { text, offsets };
}
export function scan(original, customTerms = [], sessionId = 'V1') {
  if (typeof original !== 'string') throw new Error('Prompt must be text.');
  if (!Array.isArray(customTerms) || customTerms.length > 100 || customTerms.some(x => typeof x !== 'string' || x.length > 300)) throw new Error('Use up to 100 private terms, each under 300 characters.');
  if (original.length > 30000) throw new Error('Keep each prompt under 30,000 characters.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(original)) throw new Error('Invisible or direction-changing characters found. Remove them before scanning.');
  const { text, offsets } = canonicalize(original);
  if (text.length > 30000) throw new Error('Keep each prompt under 30,000 characters.');
  if (typeof sessionId !== 'string' || !/^[A-Z0-9]{1,64}$/.test(sessionId)) throw new Error('Invalid session ID.');
  if (new RegExp(reserved).test(text)) throw new Error('This prompt already contains MIRAGE tokens. Start with the original text.');
  const candidates = [];
  function add(type, start, value, note = '', priority = 10) {
    if (candidates.length >= 4000) throw new Error('Too many matches. Split this prompt into smaller parts.');
    if (value) {
      const from = offsets[start][0], to = offsets[start + value.length - 1][1];
      candidates.push({ type, label: labels[type], start: from, end: to, value: original.slice(from, to), note, priority, blocked: type === 'SECRET' || type === 'CARD' });
    }
  }
  function match(type, regex, note, priority = 10, predicate = () => true, group = 0) {
    for (const m of text.matchAll(regex)) {
      const value = m[group];
      if (predicate(value)) add(type, m.index + (group ? m[0].lastIndexOf(value) : 0), value, note, priority);
    }
  }
  match('SECRET', /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, 'Recognized credential pattern', 100);
  match('SECRET', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|$)/g, 'Private key material', 100);
  match('SECRET', /\b(?:password|passwd|pwd|api[ _-]?key|(?:aws[ _-]?)?secret(?:[ _-]?access)?[ _-]?key|secret|access[ _-]?token|client[ _-]?secret|authorization|otp|one[ -]time[ -]password|pin)\b["']?\s*(?:(?:is|equals)\s+|[:=]\s*)["']?([^\s"',;]{1,})/gi, 'Credential or verification code label', 100);
  match('SECRET', /\b(?:otp|verification code|security code)\s+(\d{4,8})\b/gi, 'Verification code', 100);
  match('SECRET', /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}=*/gi, 'Bearer credential', 100);
  match('SECRET', /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, 'JWT-shaped credential', 100);
  match('SECRET', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@[^\s/]+/gi, 'Credentials embedded in a URL', 100);
  match('CARD', /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g, 'Luhn check passed', 90, luhn);
  match('CARD', /\b(?:card(?:\s+number)?|cvv|cvc)\s*(?::|=|is)?\s*\d[\d -]{2,22}\d\b/gi, 'Payment credential label', 90);
  match('AADHAAR', /(?<!\d)[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?!\d)/g, 'Aadhaar-shaped number', 50);
  match('PAN', /\b[A-Z]{5}\d{4}[A-Z]\b/gi, 'Format match; identity not verified', 50);
  match('IFSC', /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, 'Format match; bank not verified', 50);
  match('EMAIL', /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+\b/gi, 'Email format', 40);
  match('UPI', /\b[A-Z0-9][A-Z0-9._-]{1,255}@[A-Z][A-Z0-9]{1,63}\b/gi, 'UPI-shaped ID; handle not verified', 30);
  match('PHONE', /(?<![\w\d])(?:\+91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?!\d)/g, 'Indian mobile format', 20);
  match('PHONE', /(?<![\w\d])(?:\+91[ -]?)?[6-9]\d{2}[ -]\d{3}[ -]\d{4}(?!\d)/g, 'Indian mobile format', 20);
  match('PHONE', /(?<![\w\d])\+[1-9]\d{0,2}(?:[ ().-]*\d){7,13}(?!\d)/g, 'International phone format', 25, value => { const n = value.replace(/\D/g,'').length; return n >= 10 && n <= 15; });
  match('PHONE', /\b(?:phone|mobile|tel(?:ephone)?)\s*(?::|=|is)?\s*(\d(?:[ ().-]*\d){9,14})(?!\d)/gi, 'Labeled phone number', 25, () => true, 1);
  match('PERSON', /\b(?:[Ii] am|[Ii]['’]m|[Mm]y name is|[Nn]ame\s*:)\s+(\p{Lu}[\p{L}\p{M}]*(?:['’-][\p{L}\p{M}]+)?(?:[ ]\p{Lu}[\p{L}\p{M}]*(?:['’-][\p{L}\p{M}]+)?){0,3})(?!\p{L})/gu, 'Name after an introduction; heuristic', 15, () => true, 1);
  const repeatedNames = [...new Set(candidates.filter(x => x.type === 'PERSON').map(x => x.value))];
  for (const [term, type] of customTerms.map(x => x.trim()).filter(Boolean).map(x => [x, 'CUSTOM']).concat(repeatedNames.map(x => [x, 'PERSON']))) {
    const escaped = canonicalize(term).text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const m of text.matchAll(new RegExp(escaped, 'giu'))) add(type, m.index, m[0], type === 'PERSON' ? 'Repeated detected name' : 'Added by you', 14);
  }
  // Union overlapping spans, rather than dropping a larger identifier when a
  // custom term matches its prefix. Dropping it would leak the remaining suffix.
  candidates.sort((a, b) => a.start - b.start || b.end - a.end || b.priority - a.priority);
  const findings = [];
  for (const item of candidates) {
    const previous = findings.at(-1);
    if (!previous || item.start >= previous.end) { findings.push({ ...item }); continue; }
    const end = Math.max(previous.end, item.end);
    if (item.blocked || previous.blocked) {
      previous.type = item.blocked ? item.type : previous.type; previous.blocked = true;
      previous.note = 'Credential detected in overlapping details';
    } else if (end > previous.end) { previous.type = 'PRIVATE'; previous.note = 'Overlapping matches masked together'; }
    previous.end = end; previous.value = original.slice(previous.start, end); previous.label = labels[previous.type];
  }
  findings.sort((a, b) => a.start - b.start);
  for (const finding of findings) if (finding.type === 'AADHAAR') finding.note = verhoeff(canonicalize(finding.value).text) ? 'Verhoeff checksum passed' : 'Checksum failed; masked as a precaution';
  const blocked = findings.some(x => x.blocked);
  const vault = new Map();
  const known = new Map();
  const counts = {};
  let masked = '', cursor = 0;
  if (!blocked) {
    for (const finding of findings) {
      const key = `${finding.type}:${finding.value}`;
      let token = known.get(key);
      if (!token) {
        counts[finding.type] = (counts[finding.type] || 0) + 1;
        token = `[MG_${sessionId}_${finding.type}_${counts[finding.type]}]`;
        known.set(key, token);
        vault.set(token, finding.value);
      }
      finding.token = token;
      masked += original.slice(cursor, finding.start) + token;
      cursor = finding.end;
    }
    masked += original.slice(cursor);
  }
  return { blocked, findings, masked: blocked ? null : masked, vault };
}
export function restore(reply, vault) {
  if (typeof reply !== 'string' || reply.length > 60000) throw new Error('Keep replies under 60,000 characters.');
  const unknown = new Set();
  const text = reply.replace(new RegExp(reserved), token => {
    if (vault.has(token)) return vault.get(token);
    unknown.add(token);
    return token;
  });
  return { text, unknown: [...unknown] };
}
