import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const vendorRoot = join(projectRoot, 'vendor', 'GitNexus');
const sharedRoot = join(vendorRoot, 'gitnexus-shared');
const cliRoot = join(vendorRoot, 'gitnexus');

function run(command, args, cwd) {
    const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
    const result = spawnSync(executable, args, { cwd, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(join(vendorRoot, 'package.json'))) {
    console.error('GitNexus submodule is missing. Run: git submodule update --init --recursive');
    process.exit(1);
}

const major = Number(process.versions.node.split('.')[0]);
const minor = Number(process.versions.node.split('.')[1]);
if (!(major >= 25 || (major === 24 && minor >= 11) || (major === 22 && minor >= 18))) {
    console.error(`GitNexus requires Node.js 22.18+ or 24.11+. Current: ${process.version}`);
    process.exit(1);
}

console.log('Building the pinned GitNexus runtime…');
run('npm', ['ci', '--no-audit', '--no-fund'], sharedRoot);
run('npm', ['run', 'build'], sharedRoot);
run('npm', ['ci', '--no-audit', '--no-fund'], cliRoot);
run('npm', ['run', 'build'], cliRoot);
console.log('GitNexus is ready. Try: npm run gitnexus -- status');
