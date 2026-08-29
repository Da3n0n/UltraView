import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pin = JSON.parse(readFileSync(join(projectRoot, 'resources', 'gitnexus-version.json'), 'utf8'));
const sourceRoot = join(projectRoot, 'vendor', 'GitNexus', 'gitnexus');
const runtimeRoot = join(projectRoot, 'resources', 'gitnexus-runtime');
const packageRoot = join(runtimeRoot, 'node_modules', 'gitnexus');
const marker = join(runtimeRoot, 'runtime.json');
const cli = join(packageRoot, 'dist', 'cli', 'index.js');

if (existsSync(marker) && existsSync(cli)) {
    const prepared = JSON.parse(readFileSync(marker, 'utf8'));
    if (prepared.version === pin.version && prepared.commit === pin.commit) {
        console.log(`Bundled GitNexus runtime is ready (${pin.version}).`);
        process.exit(0);
    }
}

const sourceCli = join(sourceRoot, 'dist', 'cli', 'index.js');
const sourceModules = join(sourceRoot, 'node_modules');
if (!existsSync(sourceCli) || !existsSync(sourceModules)) {
    console.error('The verified GitNexus source runtime is not built. Run: npm run setup:gitnexus');
    process.exit(1);
}

rmSync(runtimeRoot, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
mkdirSync(packageRoot, { recursive: true });
console.log(`Copying self-contained GitNexus runtime ${pin.version}…`);
cpSync(sourceModules, join(runtimeRoot, 'node_modules'), { recursive: true, force: true });
cpSync(join(sourceRoot, 'dist'), join(packageRoot, 'dist'), { recursive: true, force: true });
cpSync(join(sourceRoot, 'vendor'), join(packageRoot, 'vendor'), { recursive: true, force: true });
cpSync(join(sourceRoot, 'package.json'), join(packageRoot, 'package.json'), { force: true });
writeFileSync(marker, `${JSON.stringify({ version: pin.version, commit: pin.commit }, null, 4)}\n`);
console.log('Self-contained GitNexus runtime prepared.');
