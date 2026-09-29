import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSuggestions, findResidualLocalSensitiveData, parseScanRequest, response } from '../infra/aws/functions/privacy-scan/core.mjs';

const scanId = 'A1B2C3D4E5F6G7H8';

test('AWS request parser requires explicit consent and locally masked English text', () => {
  assert.deepEqual(parseScanRequest(JSON.stringify({ consent: true, language: 'en', scanId, maskedText: 'Ask [PERSON_1] to review this.' })), {
    language: 'en', scanId, maskedText: 'Ask [PERSON_1] to review this.'
  });
  assert.throws(() => parseScanRequest({ language: 'en', scanId, maskedText: 'hello' }), /consent/);
  assert.throws(() => parseScanRequest({ consent: true, language: 'hi', scanId, maskedText: 'hello' }), /English/);
  assert.throws(() => parseScanRequest({ consent: true, language: 'en', scanId: 'short', maskedText: 'hello' }), /identifier/);
  assert.throws(() => parseScanRequest({ consent: true, language: 'en', scanId, maskedText: 'x'.repeat(10001) }), /10 KB/);
});

test('AWS boundary rejects obvious local identifiers and secrets but permits tokens', () => {
  for (const value of ['user@example.com', 'ABCDE1234F', '+91 98765 43210', 'AKIAABCDEFGHIJKLMNOP', 'password: hunter22']) {
    assert.ok(findResidualLocalSensitiveData(`Please use ${value}`).length, value);
  }
  assert.deepEqual(findResidualLocalSensitiveData('Email [EMAIL_1] and ask [PERSON_1] at [ADDRESS_1].'), []);
});

test('Comprehend results become allowlisted offset-only suggestions', () => {
  const text = 'Ask Priya at MG Road about asthma.';
  const suggestions = buildSuggestions(text, [
    { Type: 'NAME', BeginOffset: 4, EndOffset: 9, Score: 0.99 },
    { Type: 'ADDRESS', BeginOffset: 13, EndOffset: 20, Score: 0.91 },
    { Type: 'MEDICAL_CONDITION', BeginOffset: 27, EndOffset: 33, Score: 0.99 },
    { Type: 'NAME', BeginOffset: 0, EndOffset: 99, Score: 0.99 },
    { Type: 'NAME', BeginOffset: 0, EndOffset: 3, Score: 0.2 }
  ]);
  assert.deepEqual(suggestions, [
    { type: 'NAME', start: 4, end: 9, score: 0.99 },
    { type: 'ADDRESS', start: 13, end: 20, score: 0.91 }
  ]);
  assert.equal(JSON.stringify(suggestions).includes('Priya'), false);
  assert.equal(JSON.stringify(suggestions).includes('MG Road'), false);
});

test('AWS responses disable caching and do not reflect arbitrary origins', () => {
  const result = response(200, { ok: true }, 'https://mirage.example');
  assert.equal(result.headers['Access-Control-Allow-Origin'], 'https://mirage.example');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(JSON.parse(result.body), { ok: true });
});

test('SAM stack enforces auth, disables body tracing, and stores aggregate TTL metrics only', async () => {
  const template = await readFile(new URL('../infra/aws/template.yaml', import.meta.url), 'utf8');
  for (const expected of ['DefaultAuthorizer: MirageCognitoAuthorizer', 'DataTraceEnabled: false', 'comprehend:DetectPiiEntities', 'dynamodb:UpdateItem', 'TimeToLiveSpecification:', 'AdminCreateUserOnly: true']) {
    assert.match(template, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(template, /dynamodb:\*/);
});
