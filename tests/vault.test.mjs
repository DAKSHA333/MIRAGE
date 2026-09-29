import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionVault, IDLE_MS, newSessionId, encryptBackup, decryptBackup } from '../extension/vault.js';
const passphrase = 'test-only unique passphrase 2026';
function populated() { const v = new SessionVault(); v.add('TEST', new Map([['[MG_TEST_EMAIL_1]', 'private@example.com']])); return v; }
test('scan identifiers have 128 bits of random material', () => {
  const ids = new Set(Array.from({ length: 100 }, newSessionId)); assert.equal(ids.size, 100);
  for (const id of ids) assert.match(id, /^[A-F0-9]{32}$/);
});
test('vault expires when inactive, including lazy reads after suspended timers', () => {
  let time = 1000; const v = new SessionVault(() => time); v.add('TEST', new Map());
  time += IDLE_MS - 1; assert.equal(v.list().length, 1); time++;
  assert.throws(() => v.get('TEST'), /expired/); assert.equal(v.list().length, 0);
});
test('actions extend lifetime but metadata reads do not', () => {
  let time = 1000; const v = new SessionVault(() => time); v.add('TEST', new Map());
  time += IDLE_MS - 1; v.touch(); time += IDLE_MS - 1; assert.equal(v.list().length, 1); time++;
  assert.equal(v.list().length, 0);
});
test('vault keeps earlier scans and isolates their mappings', () => {
  const v = populated(); v.add('SECOND', new Map([['[MG_SECOND_EMAIL_1]', 'second@example.com']]));
  assert.equal(v.get('TEST').get('[MG_TEST_EMAIL_1]'), 'private@example.com'); assert.equal(v.get('SECOND').has('[MG_TEST_EMAIL_1]'), false);
  const copy = v.get('TEST'); copy.clear(); assert.equal(v.get('TEST').size, 1);
});
test('session capacity is explicit and does not silently evict mappings', () => {
  const v = new SessionVault(); for (let i = 0; i < 20; i++) v.add('S' + i, new Map());
  assert.throws(() => v.add('OVER', new Map()), /20 scans/); assert.equal(v.list().length, 20);
});
test('clear discards every mapping', () => { const v = populated(); v.clear(); assert.equal(v.list().length, 0); assert.throws(() => v.get('TEST')); });
test('encrypted backup round trips and does not contain the private value', async () => {
  const snapshot = populated().snapshot(); const ciphertext = await encryptBackup(snapshot, passphrase);
  assert.ok(!ciphertext.includes('private@example.com')); assert.deepEqual(await decryptBackup(ciphertext, passphrase), snapshot);
  const again = await encryptBackup(snapshot, passphrase); assert.notEqual(ciphertext, again);
});
test('wrong passphrase and tampered authenticated ciphertext are rejected', async () => {
  const ciphertext = await encryptBackup(populated().snapshot(), passphrase);
  await assert.rejects(decryptBackup(ciphertext, 'wrong-but-long-enough'), /Could not unlock/);
  const envelope = JSON.parse(ciphertext); envelope.ciphertext = (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1);
  await assert.rejects(decryptBackup(JSON.stringify(envelope), passphrase), /Could not unlock/);
});
test('hostile backup parameters cannot force arbitrary key-derivation work', async () => {
  const envelope = JSON.parse(await encryptBackup(populated().snapshot(), passphrase)); envelope.iterations = 2147483647;
  await assert.rejects(decryptBackup(JSON.stringify(envelope), passphrase), /Unsupported/);
  await assert.rejects(decryptBackup('x'.repeat(2000001), passphrase), /2 MB/);
  await assert.rejects(encryptBackup(populated().snapshot(), 'short'), /12/);
});
test('backup schema rejects secret mappings and cross-session token substitution', () => {
  const v = new SessionVault();
  for (const token of ['[MG_TEST_SECRET_1]', '[MG_OTHER_EMAIL_1]', '__proto__']) assert.throws(() => v.import({ version: 1, sessions: [{ id: 'TEST', createdAt: 1, entries: [[token, 'value']] }] }), /Invalid token/);
});
test('import merging is idempotent and conflicts do not overwrite', () => {
  const v = populated(); const backup = v.snapshot(); v.import(backup); assert.equal(v.list().length, 1);
  backup.sessions[0].entries[0][1] = 'attacker'; assert.throws(() => v.import(backup), /conflicting/);
  assert.equal(v.get('TEST').get('[MG_TEST_EMAIL_1]'), 'private@example.com');
});
