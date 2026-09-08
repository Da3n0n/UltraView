import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildCommandsHtml } from '../commands/commandsHtml';
import { ProjectCommand, scanWorkspaceCommands } from '../commands/commandScanner';
import { createCommandTerminal } from '../utils/commandTerminal';

export class CommandsProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'ultraview.commands';
  private static readonly activeWebviews = new Set<vscode.Webview>();
  private view?: vscode.WebviewView;
  private refreshTimer?: NodeJS.Timeout;
  private refreshWatchers: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    context.subscriptions.push({ dispose: () => this.stopRefreshWatchers() });
  }

  static openAsPanel(ctx: vscode.ExtensionContext): void {
    const panel = vscode.window.createWebviewPanel(
      'ultraview.commandsPanel',
      'Commands',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.join(ctx.extensionPath, 'dist'))],
      }
    );
    CommandsProvider.trackWebview(panel.webview, panel.onDidDispose);
    panel.webview.html = buildCommandsHtml(ctx.extensionPath, panel.webview);
    panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'ready':
        case 'refresh':
          await postCommands(panel.webview);
          break;
        case 'run':
          await runInTerminal(msg.command as ProjectCommand);
          break;
      }
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    if (webviewView.visible) this.registerRefreshWatchers();
    webviewView.onDidDispose(() => { this.stopRefreshWatchers(); this.view = undefined; });
    CommandsProvider.trackWebview(webviewView.webview, webviewView.onDidDispose);
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'dist'))],
    };
    webviewView.webview.html = buildCommandsHtml(this.context.extensionPath, webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'ready':
        case 'refresh':
          await this.postState();
          break;
        case 'run':
          await runInTerminal(msg.command as ProjectCommand);
          break;
        case 'openPanel':
          vscode.commands.executeCommand('ultraview.openCommands');
          break;
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.registerRefreshWatchers();
        void this.postState();
      } else this.stopRefreshWatchers();
    });
  }

  private async postState(): Promise<void> {
    if (!this.view?.visible) return;
    const commands = await getWorkspaceCommands();
    if (this.view?.visible) this.view.webview.postMessage({ type: 'state', commands });
  }

  private static trackWebview(
    webview: vscode.Webview,
    registerDispose: (listener: () => any) => vscode.Disposable,
  ): void {
    CommandsProvider.activeWebviews.add(webview);
    registerDispose(() => {
      CommandsProvider.activeWebviews.delete(webview);
    });
  }

  static async refreshAllViews(): Promise<void> {
    const commands = await getWorkspaceCommands();
    for (const webview of CommandsProvider.activeWebviews) {
      webview.postMessage({ type: 'state', commands });
    }
  }

  private registerRefreshWatchers(): void {
    if (this.refreshWatchers.length) return;
    const patterns = [
      '**/package.json',
      '**/justfile',
      '**/Justfile',
      '**/.justfile',
      '**/Taskfile.yml',
      '**/Taskfile.yaml',
      '**/taskfile.yml',
      '**/taskfile.yaml',
      '**/Makefile',
      '**/setup.py',
      '**/pyproject.toml',
      '**/requirements.txt',
      '**/Pipfile',
      '**/poetry.lock',
      '**/go.mod',
      '**/go.sum',
      '**/bun.lock',
      '**/bun.lockb',
      '**/bunfig.toml',
      '**/deno.json',
      '**/deno.jsonc',
      '**/deno.lock',
      '**/import_map.json',
      '**/pnpm-lock.yaml',
      '**/pnpm-workspace.yaml',
      '**/scripts/**/*.py',
      '**/scripts/**/*.ps1',
      '**/scripts/**/*.sh',
      '**/scripts/**/*.ts',
      '**/scripts/**/*.js',
      '**/tools/**/*.py',
      '**/tools/**/*.ps1',
      '**/tools/**/*.sh',
      '**/tools/**/*.ts',
      '**/tools/**/*.js',
      '**/bin/**/*.py',
      '**/bin/**/*.ps1',
      '**/bin/**/*.sh',
      '**/test/**/*.ts',
      '**/test/**/*.js',
      '**/tests/**/*.ts',
      '**/tests/**/*.js',
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.js',
      '**/*.py',
      '**/*.ps1',
      '**/*.sh',
      '**/*.ts',
      '**/*.js',
    ];

    // One brace pattern avoids duplicate events from overlapping script patterns.
    const uniquePatterns = patterns.filter(pattern => !/^\*\*\/(scripts|tools|bin|test|tests|__tests__)\//.test(pattern));
    for (const pattern of [`{${uniquePatterns.join(',')}}`]) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const refresh = () => this.scheduleRefresh();

      this.refreshWatchers.push(watcher, watcher.onDidCreate(refresh), watcher.onDidChange(refresh), watcher.onDidDelete(refresh));
    }
  }

  private stopRefreshWatchers(): void {
    for (const watcher of this.refreshWatchers.splice(0)) watcher.dispose();
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  private scheduleRefresh(): void {
    if (!this.view?.visible) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.postState();
    }, 750);
  }
}

async function runInTerminal(command: ProjectCommand): Promise<void> {
  await createCommandTerminal(getTerminalName(command), command.cwd, command.runCmd);
  recordCommandUsage(command);
  await CommandsProvider.refreshAllViews();
}

function getTerminalName(command: ProjectCommand): string {
  const dirLabel = path.basename(command.cwd) || command.folderLabel || command.workspaceLabel;
  const commandLabel = command.name || command.runCmd;
  return `${dirLabel} / ${commandLabel}`.slice(0, 80);
}

async function postCommands(webview: vscode.Webview): Promise<void> {
  const commands = await getWorkspaceCommands();
  webview.postMessage({ type: 'state', commands });
}

async function getWorkspaceCommands(): Promise<ProjectCommand[]> {
  const rootPaths = (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath);
  const commands = await scanWorkspaceCommands(rootPaths);
  // Sort by workspace order file if present, else fallback to usage
  return await sortCommandsByWorkspaceOrder(commands);
}


// --- Workspace command order tracking ---
const ORDER_FILE = '.vscode/command-order.json';

function getOrderFilePath(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;
  return path.join(folders[0].uri.fsPath, ORDER_FILE);
}

function getCommandId(command: ProjectCommand): string {
  return `${command.workspaceLabel}:${command.type}:${command.name}:${command.cwd}`;
}

function readOrderFile(): string[] {
  const file = getOrderFilePath();
  if (!file || !fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data.order) ? data.order : [];
  } catch {
    return [];
  }
}

function writeOrderFile(order: string[]): void {
  const file = getOrderFilePath();
  if (!file) return;
  try {
    fs.writeFileSync(file, JSON.stringify({ order }, null, 2));
  } catch {}
}

function recordCommandUsage(command: ProjectCommand): void {
  // Update order file: move this commandId to the front
  const id = getCommandId(command);
  let order = readOrderFile();
  order = [id, ...order.filter(x => x !== id)];
  writeOrderFile(order);
}

async function sortCommandsByWorkspaceOrder(commands: ProjectCommand[]): Promise<ProjectCommand[]> {
  const order = readOrderFile();
  // Always put dev command at top if no order
  if (!order.length) {
    return commands.slice().sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.name.localeCompare(b.name);
    });
  }
  // Sort by order file, then by priority/name for new commands
  const idMap = new Map(commands.map(cmd => [getCommandId(cmd), cmd]));
  const ordered = order.map(id => idMap.get(id)).filter(Boolean) as ProjectCommand[];
  const rest = commands.filter(cmd => !order.includes(getCommandId(cmd)));
  rest.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.name.localeCompare(b.name);
  });
  return [...ordered, ...rest];
}
