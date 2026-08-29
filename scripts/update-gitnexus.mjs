import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const vendorRoot = join(projectRoot, 'vendor', 'GitNexus');

function command(program, args, options = {}) {
    const result = spawnSync(program, args, {
        cwd: options.cwd ?? projectRoot,
        encoding: options.capture ? 'utf8' : undefined,
        stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        shell: false,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        if (options.capture && result.stderr) console.error(result.stderr.trim());
        throw new Error(`${program} ${args.join(' ')} failed with code ${result.status}`);
    }
    return options.capture ? String(result.stdout).trim() : '';
}

if (!existsSync(join(vendorRoot, '.git'))) {
    console.error('GitNexus submodule is missing. Run: git submodule update --init --recursive');
    process.exit(1);
}

const dirty = command('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: vendorRoot, capture: true });
if (dirty) {
    console.error('GitNexus has tracked local changes. Update stopped so nothing is overwritten.');
    console.error(dirty);
    process.exit(1);
}

const original = command('git', ['rev-parse', 'HEAD'], { cwd: vendorRoot, capture: true });
console.log(`Current GitNexus: ${original.slice(0, 12)}`);
command('git', ['fetch', '--prune', 'origin'], { cwd: vendorRoot });
const upstream = command('git', ['rev-parse', 'origin/main'], { cwd: vendorRoot, capture: true });
if (original === upstream) {
    console.log('GitNexus is already up to date.');
    process.exit(0);
}

const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', original, upstream], { cwd: vendorRoot, shell: process.platform === 'win32' });
if (ancestor.status !== 0) {
    console.error('Upstream history is not a fast-forward from the pinned version. Update stopped for review.');
    process.exit(1);
}

command('git', ['checkout', '--detach', upstream], { cwd: vendorRoot });
try {
    command(process.execPath, [join(projectRoot, 'scripts', 'setup-gitnexus.mjs')]);
} catch (error) {
    console.error('The new GitNexus version did not build; restoring the previous pointer.');
    command('git', ['checkout', '--detach', original], { cwd: vendorRoot });
    throw error;
}

console.log(`Updated GitNexus to ${upstream.slice(0, 12)}.`);
const packageVersion = JSON.parse(readFileSync(join(vendorRoot, 'gitnexus', 'package.json'), 'utf8')).version;
writeFileSync(
    join(projectRoot, 'resources', 'gitnexus-version.json'),
    `${JSON.stringify({ version: packageVersion, commit: upstream }, null, 4)}\n`,
);
console.log(`Pinned packaged runtime: gitnexus@${packageVersion}.`);
console.log('Your Ultraview UI was not touched. Use Project Manager Sync to commit and push this submodule pointer.');
