import './build.mjs';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('web-dist/', root);
await mkdir(output, { recursive: true });
for (const name of ['index.html','privacy.html','styles.css','boot.js','app.js','engine.js','vault.js','icon.svg']) {
  await copyFile(new URL('extension/' + name, root), new URL(name, output));
}
const manifest = JSON.parse(await readFile(new URL('dist/release-manifest.json', root), 'utf8'));
await mkdir(new URL('downloads/', output), { recursive: true });
await copyFile(new URL('dist/' + manifest.release, root), new URL('downloads/' + manifest.release, output));
await copyFile(new URL('dist/release-manifest.json', root), new URL('downloads/release-manifest.json', output));
let html = await readFile(new URL('index.html', output), 'utf8');
html = html.replace('Local workspace</strong>', 'Browser workspace</strong>');
html = html.replace('Copy and paste works here. Install the Chrome extension for the private side panel and chat insertion.', 'Text is processed in your browser. Use the Chrome extension for the private side panel and chat insertion.');
html = html.replace('<section class="work-grid"', `<p class="mode-note"><a href="downloads/${manifest.release}" download>Download the Chrome extension (1.1 RC)</a> · Extract the ZIP, then Load unpacked in Chrome’s extension settings.</p><section class="work-grid"`);
await writeFile(new URL('index.html', output), html);
console.log('Static workspace and extension download built in web-dist/.');
