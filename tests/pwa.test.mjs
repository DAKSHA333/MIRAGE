import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../web/site.webmanifest', import.meta.url), 'utf8'));
const worker = await readFile(new URL('../web/sw.js', import.meta.url), 'utf8');
const boot = await readFile(new URL('../extension/boot.js', import.meta.url), 'utf8');

test('desktop manifest is scoped, standalone, and has installable icons', () => {
  assert.equal(manifest.id, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.match(manifest.start_url, /^\//);
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  assert.ok(manifest.icons.every(icon => icon.type === 'image/png' && icon.purpose.includes('maskable')));
});

test('offline worker caches app code only and never private session data or downloads', () => {
  assert.doesNotThrow(() => new Function(worker));
  assert.match(worker, /mirage-shell-1\.5\.0/);
  for (const asset of ['/index.html', '/app.js', '/engine.js', '/vault.js']) assert.ok(worker.includes(`'${asset}'`));
  assert.doesNotMatch(worker, /localStorage|sessionStorage|IndexedDB|prompt|reply|\.mirage|downloads\//i);
  assert.match(worker, /request\.method !== 'GET'/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
});

test('service worker registration is limited to the hosted HTTPS workspace', () => {
  assert.match(boot, /location\.protocol === 'https:'/);
  assert.match(boot, /127\.0\.0\.1/);
  assert.match(boot, /serviceWorker\.register\('\/sw\.js'/);
});
