import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const url = process.argv[2];
if (!url || new URL(url).protocol !== 'https:') throw new Error('Pass the HTTPS URL where this runtime archive will be published.');
const marker = JSON.parse(await readFile(join(root, 'resources/gitnexus-runtime-archive.json'), 'utf8'));
const archive = join(root, 'resources', `gitnexus-runtime-${marker.platform}.tar.gz`);
const hash = createHash('sha256');
for await (const chunk of createReadStream(archive)) hash.update(chunk);
const manifestPath = join(root, 'resources/gitnexus-downloads.json');
let platforms = {};
try {
    const previous = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (previous.commit === marker.commit && previous.customizationFingerprint === marker.customizationFingerprint) platforms = previous.platforms;
} catch { /* first platform */ }
platforms[marker.platform] = { url, sha256: hash.digest('hex') };
await writeFile(manifestPath, JSON.stringify({ version: marker.version, commit: marker.commit,
    customizationFingerprint: marker.customizationFingerprint, platforms }, null, 2) + '\n');
console.log(`Prepared verified download manifest for ${marker.platform}. Publish ${archive} at the supplied URL before releasing the extension.`);
