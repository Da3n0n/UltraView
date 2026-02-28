import * as fs from 'fs';
import * as path from 'path';

export type CommandType = 'npm' | 'just' | 'task' | 'make';

export interface ProjectCommand {
  id: string;
  type: CommandType;
  name: string;
  description?: string;
  runCmd: string;
}

export async function scanCommands(rootPath: string): Promise<ProjectCommand[]> {
  if (!rootPath) return [];
  const all: ProjectCommand[] = [];
  await Promise.allSettled([
    scanNpm(rootPath, all),
    scanJust(rootPath, all),
    scanTask(rootPath, all),
    scanMake(rootPath, all),
  ]);
  return all;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readFile(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch { return null; }
}

// ─── NPM ─────────────────────────────────────────────────────────────────────

async function scanNpm(root: string, out: ProjectCommand[]): Promise<void> {
  const content = readFile(path.join(root, 'package.json'));
  if (!content) return;
  let pkg: any;
  try { pkg = JSON.parse(content); } catch { return; }
  const scripts = pkg.scripts;
  if (!scripts || typeof scripts !== 'object') return;

  const runner = detectNpmRunner(root);
  for (const [name, cmd] of Object.entries(scripts)) {
    out.push({
      id: `npm:${name}`,
      type: 'npm',
      name,
      description: String(cmd),
      runCmd: `${runner} ${name}`,
    });
  }
}

function detectNpmRunner(root: string): string {
  if (fs.existsSync(path.join(root, 'bun.lock')) || fs.existsSync(path.join(root, 'bun.lockb'))) {
    return 'bun run';
  }
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
    return 'pnpm run';
  }
  if (fs.existsSync(path.join(root, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm run';
}

// ─── Just ────────────────────────────────────────────────────────────────────

async function scanJust(root: string, out: ProjectCommand[]): Promise<void> {
  let content: string | null = null;
  for (const name of ['justfile', 'Justfile', '.justfile']) {
    content = readFile(path.join(root, name));
    if (content) break;
  }
  if (!content) return;

  const lines = content.split('\n');
  // Recipe: starts at col 0, alphanumeric/hyphen/underscore name, optional args, ends with ':'
  const recipeRe = /^([a-zA-Z_][a-zA-Z0-9_-]*)(\s[^:]*)?:/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(recipeRe);
    if (!match) continue;
    const name = match[1];
    // skip private recipes
    if (name.startsWith('_')) continue;

    // look for a `# doc` comment directly above
    let desc: string | undefined;
    if (i > 0) {
      const prev = lines[i - 1].trim();
      if (prev.startsWith('#')) {
        desc = prev.replace(/^#+\s*/, '').trim() || undefined;
      }
    }

    out.push({ id: `just:${name}`, type: 'just', name, description: desc, runCmd: `just ${name}` });
  }
}

// ─── Task ────────────────────────────────────────────────────────────────────

async function scanTask(root: string, out: ProjectCommand[]): Promise<void> {
  let content: string | null = null;
  for (const name of ['Taskfile.yml', 'Taskfile.yaml', 'taskfile.yml', 'taskfile.yaml']) {
    content = readFile(path.join(root, name));
    if (content) break;
  }
  if (!content) return;

  // Simple line-by-line YAML parser for the tasks section
  const lines = content.split('\n');
  let inTasks = false;
  let tasksBaseIndent = -1;
  let currentTask: string | null = null;
  let currentDesc: string | undefined;

  const flush = () => {
    if (!currentTask) return;
    out.push({ id: `task:${currentTask}`, type: 'task', name: currentTask, description: currentDesc, runCmd: `task ${currentTask}` });
    currentTask = null;
    currentDesc = undefined;
  };

  for (const line of lines) {
    const raw = line.trimEnd();
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();

    if (!inTasks) {
      if (trimmed === 'tasks:') { inTasks = true; tasksBaseIndent = indent; }
      continue;
    }

    // Exiting tasks section (back to root level key)
    if (indent <= tasksBaseIndent && trimmed !== 'tasks:' && trimmed.endsWith(':')) {
      flush();
      break;
    }

    // Task name at one level deeper than 'tasks:'
    if (indent === tasksBaseIndent + 2 && trimmed.match(/^[a-zA-Z_][a-zA-Z0-9_:-]*\s*:/)) {
      flush();
      const m = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_:-]*)\s*:/);
      if (m && !m[1].startsWith('_')) {
        currentTask = m[1];
      }
      continue;
    }

    // 'desc:' field inside a task
    if (currentTask && indent > tasksBaseIndent + 2) {
      const dm = trimmed.match(/^desc:\s*["']?(.+?)["']?\s*$/);
      if (dm) currentDesc = dm[1];
    }
  }
  flush();
}

// ─── Make ────────────────────────────────────────────────────────────────────

async function scanMake(root: string, out: ProjectCommand[]): Promise<void> {
  const content = readFile(path.join(root, 'Makefile'));
  if (!content) return;

  const lines = content.split('\n');
  const targetRe = /^([a-zA-Z_][a-zA-Z0-9_./-]*)\s*:/;
  const phonyRe = /^\.PHONY\s*:(.*)/;

  const phony = new Set<string>();
  for (const line of lines) {
    const m = line.match(phonyRe);
    if (m) m[1].trim().split(/\s+/).forEach(t => phony.add(t));
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('\t') || line.startsWith(' ') || line.startsWith('#')) continue;
    const match = line.match(targetRe);
    if (!match) continue;
    const name = match[1];
    if (name.startsWith('.') || name.includes('$(') || name.includes('%')) continue;

    // inline ## description or comment line above
    let desc: string | undefined;
    const inlineComment = line.match(/##\s*(.+)$/);
    if (inlineComment) {
      desc = inlineComment[1].trim();
    } else if (i > 0) {
      const prev = lines[i - 1].trim();
      if (prev.startsWith('#')) desc = prev.replace(/^#+\s*/, '').trim() || undefined;
    }

    out.push({ id: `make:${name}`, type: 'make', name, description: desc, runCmd: `make ${name}` });
  }
}
