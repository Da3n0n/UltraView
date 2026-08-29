import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(projectRoot, 'vendor', 'GitNexus', 'gitnexus', 'dist', 'cli', 'index.js');

function run(command, args, cwd = projectRoot) {
    const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(cli)) run(process.execPath, [join(projectRoot, 'scripts', 'setup-gitnexus.mjs')]);
run(process.execPath, [cli, ...process.argv.slice(2)]);
