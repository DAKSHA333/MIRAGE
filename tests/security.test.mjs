import test from 'node:test';
import assert from 'node:assert/strict';
import { scan, restore } from '../extension/engine.js';

test('custom term inside an email cannot leak its unmasked suffix', () => {
  const original = 'Reach priya@example.com today.';
  const result = scan(original, ['priya']);
  assert.ok(!result.masked.includes('example.com'));
  assert.equal(restore(result.masked, result.vault).text, original);
});
test('overlapping private terms mask their union completely', () => {
  const result = scan('abcdefgh', ['abcde', 'defgh']);
  assert.equal(result.vault.size, 1); assert.equal([...result.vault.values()][0], 'abcdefgh');
});
test('custom term inside a Unicode case expansion cannot shift original offsets', () => {
  const original = 'İ text alice@example.com after';
  const r = scan(original, ['alice']); assert.equal(restore(r.masked, r.vault).text, original);
  assert.ok(!r.masked.includes('example.com'));
});
test('fullwidth and non-ASCII digits are detected without corrupting original text', () => {
  for (const value of ['ＡＢＣＤＥ１２３４Ｆ', '９８４５０１２３４５', '९८४५०१२३४५', '٩٨٤٥٠١٢٣٤٥', '۹۸۴۵۰۱۲۳۴۵']) {
    const r = scan('ID: ' + value); assert.ok(r.vault.size > 0, value); assert.ok(!r.masked.includes(value));
    assert.equal(restore(r.masked, r.vault).text, 'ID: ' + value);
  }
});
test('invisible and bidi control obfuscation fails closed', () => {
  for (const c of ['\u200b', '\u202e', '\u2066', '\u0000']) assert.throws(() => scan('sk-test' + c + '123456789012345'), /Invisible/);
});
test('JSON credentials, environment secrets, JWTs and URL credentials are blocked', () => {
  for (const value of ['{"password":"not-a-real-password"}', "'api_key': 'demo-value'", 'AWS_SECRET_ACCESS_KEY=demo-secret-value', 'client_secret = demo-value', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.abcde123456789', 'postgres://demo:password@localhost/db', 'Ｃｌｉｅｎｔ＿ｓｅｃｒｅｔ： demo-value']) {
    const r = scan(value); assert.equal(r.blocked, true, value); assert.equal(r.masked, null); assert.equal(r.vault.size, 0);
  }
});
test('detected names are masked on later occurrences', () => {
  const r = scan("I'm Priya Nair. Please address the letter to Priya Nair.");
  assert.ok(!r.masked.includes('Priya')); assert.equal(r.findings.length, 2);
});
test('international phone and labeled telephone formats are protected', () => {
  for (const value of ['+1 (415) 555-2671', '+44 20 7946 0958', 'phone: 212-555-0123']) {
    const r = scan(value); assert.ok(r.findings.some(x => x.type === 'PHONE'), value);
    assert.equal(restore(r.masked, r.vault).text, value);
  }
});
test('Unicode name and literal HTML round trip without interpretation', () => {
  const original = "I'm Élodie Martin. <img src=x onerror=alert(1)>";
  const r = scan(original); assert.ok(!r.masked.includes('Élodie')); assert.equal(restore(r.masked, r.vault).text, original);
});
test('invalid input and excessive custom match counts fail closed', () => {
  assert.throws(() => scan(null), /text/); assert.throws(() => scan('text', [null]), /private terms/);
  assert.throws(() => scan('text', Array(101).fill('a')), /100/);
  assert.throws(() => scan('a'.repeat(10000), ['a']), /Too many/);
  assert.throws(() => restore('x'.repeat(60001), new Map()), /60,000/);
});
test('round-trip corpus of varied original values and adjacent matches', () => {
  const chunks = ["I'm Anika Rao.", ' Call +91 98765 43210.', ' PAN ABCDE1234F.', ' user.name@example.org', ' UPI user@okaxis.', ' IFSC SBIN0001234.', ' a+b (office)', ' 😀 नमस्ते café ', '<script>literal</script>', '１２３'];
  let seed = 918273;
  for (let n = 0; n < 250; n++) {
    let text = '';
    for (let j = 0; j < 8; j++) { seed = (seed * 1664525 + 1013904223) >>> 0; text += chunks[seed % chunks.length]; }
    const r = scan(text, ['a+b (office)', 'नमस्ते'], 'ROUND' + n);
    assert.equal(r.blocked, false); assert.equal(restore(r.masked, r.vault).text, text);
  }
});
