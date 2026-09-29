const LOCAL_SENSITIVE_PATTERNS = [
  { type: 'SECRET', regex: /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/ },
  { type: 'SECRET', regex: /\b(?:password|passwd|pwd|api[ _-]?key|secret|access[ _-]?token|client[ _-]?secret|authorization|otp|pin)\b["']?\s*(?:(?:is|equals)\s+|[:=]\s*)["']?[^\s"',;]+/i },
  { type: 'EMAIL', regex: /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+\b/i },
  { type: 'PAN', regex: /\b[A-Z]{5}\d{4}[A-Z]\b/i },
  { type: 'AADHAAR', regex: /(?<!\d)[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?!\d)/ },
  { type: 'PHONE', regex: /(?<![\w\d])(?:\+91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?!\d)/ }
];
const ALLOWED_ENTITY_TYPES = new Set(['NAME', 'ADDRESS']);

export function parseScanRequest(body) {
  let value;
  try { value = typeof body === 'string' ? JSON.parse(body) : body; } catch { throw new Error('Request body must be valid JSON.'); }
  if (!value || value.consent !== true) throw new Error('Explicit cloud-analysis consent is required.');
  if (value.language !== 'en') throw new Error('This AWS scan currently supports English only.');
  if (typeof value.scanId !== 'string' || !/^[A-Z0-9]{16,64}$/.test(value.scanId)) throw new Error('Invalid local scan identifier.');
  if (typeof value.maskedText !== 'string' || !value.maskedText.trim()) throw new Error('Masked text is required.');
  if (Buffer.byteLength(value.maskedText, 'utf8') > 10000) throw new Error('Masked text must be 10 KB or smaller.');
  return { maskedText: value.maskedText, language: value.language, scanId: value.scanId };
}

export function findResidualLocalSensitiveData(maskedText) {
  return LOCAL_SENSITIVE_PATTERNS.filter(rule => rule.regex.test(maskedText)).map(rule => rule.type);
}

export function buildSuggestions(maskedText, entities, minimumScore = 0.85) {
  if (!Array.isArray(entities)) return [];
  return entities
    .filter(entity => ALLOWED_ENTITY_TYPES.has(entity?.Type) && Number.isFinite(entity?.Score) && entity.Score >= minimumScore)
    .filter(entity => Number.isInteger(entity.BeginOffset) && Number.isInteger(entity.EndOffset) && entity.BeginOffset >= 0 && entity.EndOffset > entity.BeginOffset && entity.EndOffset <= maskedText.length)
    .map(entity => ({ type: entity.Type, start: entity.BeginOffset, end: entity.EndOffset, score: Number(entity.Score.toFixed(4)) }));
}

export function response(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'Referrer-Policy': 'no-referrer'
    },
    body: JSON.stringify(body)
  };
}
