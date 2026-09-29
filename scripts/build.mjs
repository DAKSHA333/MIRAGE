import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'extension');
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) throw new Error('Package and extension versions differ.');
if (manifest.host_permissions || manifest.content_scripts || manifest.web_accessible_resources || manifest.externally_connectable) throw new Error('Unexpected browser exposure in manifest.');
const files = (await readdir(source)).sort();
for (const file of files.filter(f => f.endsWith('.js'))) execFileSync(process.execPath, ['--check', join(source, file)]);
for (const required of ['index.html', 'engine.js', 'vault.js', 'providers.js', 'background.js', 'app.js', 'styles.css', 'privacy.html']) if (!files.includes(required)) throw new Error('Missing ' + required);
// Deterministic ZIP with stored entries, no third-party build code or timestamps.
function crc32(data) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
const local = [], central = [], hashes = []; let offset = 0;
for (const file of files) {
  if (!/^[a-z0-9.-]+$/.test(file)) throw new Error('Unexpected release file: ' + file);
  const data = await readFile(join(source, file)), name = Buffer.from(file), crc = crc32(data);
  const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x21, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
  local.push(header, name, data);
  const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x21, 14); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
  central.push(entry, name); offset += header.length + name.length + data.length;
  hashes.push({ file, sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length });
}
const centralData = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...local, centralData, end]);
await mkdir(join(root, 'dist'), { recursive: true });
const filename = `MIRAGE-${manifest.version}-rc.zip`;
await writeFile(join(root, 'dist', filename), zip);
await writeFile(join(root, 'dist', 'release-manifest.json'), JSON.stringify({ version: manifest.version, release: filename, sha256: createHash('sha256').update(zip).digest('hex'), files: hashes }, null, 2) + '\n');
console.log(`Built dist/${filename} (${zip.length} bytes). Includes extension assets only.`);
