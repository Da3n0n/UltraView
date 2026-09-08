import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const resources = new URL('../resources/', import.meta.url);
const pin = JSON.parse(await readFile(new URL('gitnexus-version.json', resources), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('gitnexus-downloads.json', resources), 'utf8'));
if (manifest.version !== pin.version || manifest.commit !== pin.commit) throw new Error('Runtime download manifest is stale.');
if (!Object.keys(manifest.platforms ?? {}).length) throw new Error('Publish the runtime release and copy its generated manifest into resources before releasing Ultraview.');
for (const [platform, entry] of Object.entries(manifest.platforms)) {
    if (new URL(entry.url).protocol !== 'https:' || !/^[a-f0-9]{64}$/i.test(entry.sha256)) throw new Error(`Invalid runtime entry: ${platform}`);
    const response = await fetch(entry.url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body) throw new Error(`Runtime asset unavailable: ${platform} (${response.status})`);
    const hash = createHash('sha256');
    for await (const chunk of response.body) hash.update(chunk);
    if (hash.digest('hex') !== entry.sha256.toLowerCase()) throw new Error(`Runtime checksum mismatch: ${platform}`);
    console.log(`Verified ${platform}`);
}
