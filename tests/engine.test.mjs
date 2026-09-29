import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scan, restore, verhoeff, luhn } from '../extension/engine.js';

test('deck example masks the four identifiers and keeps the question intact', () => {
  const original = "Hi, I'm Priya Nair. My PAN is ABCDE1234F and my number is 98450 12345. My HbA1c came back at 7.9, what does that mean? Also draft a sick-leave mail to hod.cse@pu.edu.in.";
  const r = scan(original);
  assert.equal(r.blocked, false);
  assert.deepEqual(r.findings.map(x => x.type), ['PERSON', 'PAN', 'PHONE', 'EMAIL']);
  for (const value of r.vault.values()) assert.ok(!r.masked.includes(value));
  assert.match(r.masked, /HbA1c came back at 7.9/);
  assert.equal(restore(r.masked, r.vault).text, original);
});
test('duplicate values use the same token and all occurrences restore', () => {
  const r = scan('a@example.com and a@example.com');
  assert.equal(r.vault.size, 1);
  assert.equal(r.findings[0].token, r.findings[1].token);
  assert.equal(restore(r.masked, r.vault).text, 'a@example.com and a@example.com');
});
test('secrets block the entire output and leave no reversible secret map', () => {
  for (const text of ['password: hunter2', 'OTP is 123456', 'otp 123456', 'api_key=example-secret', 'sk-demo-1234567890abcdefghijklmnop', 'AKIAIOSFODNN7EXAMPLE', 'Bearer abcdefghijklmnop', '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----', 'card: 1234 5678 1234 5678', '4111 1111 1111 1111']) {
    const r = scan(text);
    assert.ok(r.blocked, text); assert.equal(r.masked, null); assert.equal(r.vault.size, 0);
  }
});
test('custom term overlapping a secret cannot downgrade it to a mask', () => {
  assert.equal(scan('password: hunter2', ['password: hunter2']).blocked, true);
});
test('email takes priority over partial UPI handle', () => {
  const r = scan('Send to priya.nair@example.com or priya@okaxis');
  assert.deepEqual(r.findings.map(x => x.type), ['EMAIL', 'UPI']);
  assert.ok(!r.masked.includes('example.com'));
});
test('Indian formats mask and conservatively include invalid Aadhaar checksums', () => {
  const r = scan('ABCDE1234F SBIN0001234 2345 6789 0124 2345 6789 0123 +91 98450 12345');
  assert.deepEqual(r.findings.map(x => x.type), ['PAN', 'IFSC', 'AADHAAR', 'AADHAAR', 'PHONE']);
  assert.equal(verhoeff('234567890124'), true);
  assert.equal(verhoeff('234567890123'), false);
  assert.match(r.findings[3].note, /failed/);
});
test('labeled identity and account fields are masked and restore exactly', () => {
  const original = 'DOB: 14/08/2004. Passport number: Z1234567. Employee ID: NX-2041. Bank account number is 00123456789. Home address is 42 Lotus Park, Pune.';
  const r = scan(original, [], 'LABELS');
  assert.deepEqual(r.findings.map(x => x.type), ['DOB', 'PASSPORT', 'RECORDID', 'BANKACCOUNT', 'ADDRESS']);
  for (const value of ['14/08/2004', 'Z1234567', 'NX-2041', '00123456789', '42 Lotus Park, Pune']) assert.ok(!r.masked.includes(value));
  assert.equal(restore(r.masked, r.vault).text, original);
});
test('label-aware rules avoid unlabeled codes and reject impossible birth dates', () => {
  const r = scan('The project date is 14/08/2004 and its internal code is NX-2041. DOB: 31/02/2004.');
  assert.equal(r.findings.length, 0); assert.equal(r.masked, 'The project date is 14/08/2004 and its internal code is NX-2041. DOB: 31/02/2004.');
});
test('custom terms handle unicode and regex punctuation literally', () => {
  const text = 'Meet दिशा at A+B (HQ). दिशा will attend.';
  const r = scan(text, ['दिशा', 'A+B (HQ)']);
  assert.equal(r.findings.length, 3); assert.equal(r.vault.size, 2);
  assert.equal(restore(r.masked, r.vault).text, text);
});
test('restoration does not reinterpret dollars or recursively expand values', () => {
  const r = scan('My value is $& and $1', ['$&', '$1']);
  assert.equal(restore(r.masked, r.vault).text, 'My value is $& and $1');
});
test('unknown tokens stay unchanged and are reported', () => {
  const r = restore('Hi [MG_OTHER_PERSON_1]', new Map());
  assert.equal(r.text, 'Hi [MG_OTHER_PERSON_1]'); assert.equal(r.unknown.length, 1);
});
test('tokens from different scans cannot resolve using another map', () => {
  const a = scan('a@example.com', [], 'AAA'); const b = scan('b@example.com', [], 'BBB');
  assert.equal(restore(a.masked, b.vault).unknown.length, 1);
});
test('reserved tokens cannot collide with original prompt content', () => {
  assert.throws(() => scan('User text [MG_V1_PAN_1]'), /already contains/);
});
test('plain prose and health values remain unchanged', () => {
  const r = scan('Explain HbA1c 7.9 and write a polite meeting request.');
  assert.equal(r.findings.length, 0); assert.equal(r.blocked, false);
});
test('oversized input is rejected', () => assert.throws(() => scan('x'.repeat(30001)), /30,000/));
test('Luhn rejects invalid and repeated digits', () => {
  assert.equal(luhn('4111111111111111'), true); assert.equal(luhn('4111111111111112'), false); assert.equal(luhn('0000000000000000'), false);
});
test('extension has no install-time host permissions or cloud connectivity', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url)));
  assert.equal(manifest.manifest_version, 3); assert.deepEqual(manifest.permissions, ['sidePanel', 'activeTab', 'scripting']); assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ['https://chatgpt.com/*', 'https://gemini.google.com/*']);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
  assert.ok(manifest.description.length <= 132);
});
