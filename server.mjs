import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
const root = fileURLToPath(new URL('./', import.meta.url));
const files = Object.fromEntries(['index.html','privacy.html','styles.css','boot.js','app.js','engine.js','vault.js','icon.svg'].map(name => ['/' + name, [`extension/${name}`, name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript']]));
files['/site.webmanifest'] = ['web/site.webmanifest', 'application/manifest+json'];
files['/sw.js'] = ['web/sw.js', 'text/javascript'];
files['/icons/mirage-192.png'] = ['web/icons/mirage-192.png', 'image/png'];
files['/icons/mirage-512.png'] = ['web/icons/mirage-512.png', 'image/png'];
files['/'] = files['/index.html'];
const server = http.createServer(async (req, res) => {
  if (!['127.0.0.1:4173', 'localhost:4173'].includes(req.headers.host)) { res.writeHead(403); res.end('Forbidden host'); return; }
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { res.writeHead(400); res.end('Invalid URL'); return; }
  const file = Object.hasOwn(files, pathname) ? files[pathname] : null;
  if (!['GET','HEAD'].includes(req.method) || !file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(join(root, file[0]));
    const headers = { 'Content-Type': `${file[1]}${file[1].startsWith('image/') ? '' : '; charset=utf-8'}`, 'Cache-Control': pathname === '/sw.js' ? 'no-cache' : 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" };
    if (pathname === '/sw.js') headers['Service-Worker-Allowed'] = '/';
    res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : body);
  }
  catch { res.writeHead(500); res.end('Unable to load workspace'); }
});
const openBrowser = () => {
  if (process.platform === 'win32') execFile('cmd.exe', ['/c', 'start', '', 'http://127.0.0.1:4173'], { windowsHide: true });
};
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error('Port 4173 is already in use. If MIRAGE is already running, open http://127.0.0.1:4173.');
    process.exitCode = 1;
  } else { console.error(error.message); process.exitCode = 1; }
});
server.listen(4173, '127.0.0.1', () => {
  console.log('MIRAGE 1.5 RC: http://127.0.0.1:4173');
  if (process.argv.includes('--open')) openBrowser();
});
