import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { applyGitNexusCustomizations, gitNexusCustomizationFingerprint } from './gitnexus-customizations.mjs';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const resourcesRoot = join(projectRoot, 'resources');
const pin = JSON.parse(readFileSync(join(resourcesRoot, 'gitnexus-version.json'), 'utf8'));
const sourceRoot = join(projectRoot, 'vendor', 'GitNexus', 'gitnexus');
const stagingRoot = join(resourcesRoot, '.gitnexus-runtime-staging');
const packageRoot = join(stagingRoot, 'node_modules', 'gitnexus');
const platformKey = `${process.platform}-${process.arch}`;
const runtimeFormat = 2;
const customizationFingerprint = gitNexusCustomizationFingerprint();
const archive = join(resourcesRoot, `gitnexus-runtime-${platformKey}.tar.gz`);
const archiveMarker = join(resourcesRoot, 'gitnexus-runtime-archive.json');

if (existsSync(archive) && existsSync(archiveMarker)) {
    const prepared = JSON.parse(readFileSync(archiveMarker, 'utf8'));
    if (prepared.version === pin.version && prepared.commit === pin.commit && prepared.platform === platformKey && prepared.runtimeFormat === runtimeFormat && prepared.customizationFingerprint === customizationFingerprint) {
        console.log(`Compressed GitNexus runtime is ready (${pin.version}, ${platformKey}).`);
        process.exit(0);
    }
}

const sourceCli = join(sourceRoot, 'dist', 'cli', 'index.js');
const sourceModules = join(sourceRoot, 'node_modules');
const sourceWeb = join(sourceRoot, 'web');
if (!existsSync(sourceCli) || !existsSync(sourceModules) || !existsSync(sourceWeb)) {
    console.error('The verified GitNexus source runtime is not built. Run: npm run setup:gitnexus');
    process.exit(1);
}

rmSync(stagingRoot, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
mkdirSync(packageRoot, { recursive: true });
console.log(`Staging GitNexus runtime ${pin.version}…`);
cpSync(sourceModules, join(stagingRoot, 'node_modules'), { recursive: true, force: true });
cpSync(join(sourceRoot, 'dist'), join(packageRoot, 'dist'), { recursive: true, force: true });
cpSync(join(sourceRoot, 'vendor'), join(packageRoot, 'vendor'), { recursive: true, force: true });
cpSync(sourceWeb, join(packageRoot, 'web'), { recursive: true, force: true });
applyGitNexusCustomizations(join(packageRoot, 'web'));
cpSync(join(sourceRoot, 'package.json'), join(packageRoot, 'package.json'), { force: true });
const bundledNode = join(stagingRoot, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
mkdirSync(dirname(bundledNode), { recursive: true });
cpSync(process.execPath, bundledNode, { force: true });
writeFileSync(join(stagingRoot, 'runtime.json'), `${JSON.stringify({ version: pin.version, commit: pin.commit, platform: platformKey, runtimeFormat, customizationFingerprint }, null, 4)}\n`);

console.log('Compressing the on-demand runtime…');
rmSync(archive, { force: true });
const tar = spawnSync('tar', ['-czf', archive, '-C', stagingRoot, '.'], { stdio: 'inherit' });
if (tar.error) throw tar.error;
if (tar.status !== 0) process.exit(tar.status ?? 1);
writeFileSync(archiveMarker, `${JSON.stringify({ version: pin.version, commit: pin.commit, platform: platformKey, runtimeFormat, customizationFingerprint }, null, 4)}\n`);
rmSync(stagingRoot, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
rmSync(join(resourcesRoot, 'gitnexus-runtime'), { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
console.log('Compressed on-demand GitNexus runtime prepared.');
