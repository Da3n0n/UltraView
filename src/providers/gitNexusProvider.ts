import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitNexusRuntime } from '../gitNexus/runtime';
import type { GitNexusRepository, GitNexusSnapshot } from '../gitNexus/types';

function webviewHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
    const script = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'dist', 'gitNexus.next.js')));
    const nonce = Math.random().toString(36).slice(2);
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <title>GitNexus</title>
  <style>html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground)}</style>
</head>
<body><div id="root"></div><script nonce="${nonce}">window.__vscodeApi=acquireVsCodeApi();</script><script nonce="${nonce}" src="${script}"></script></body>
</html>`;
}

function repoSelector(repo: GitNexusRepository): string {
    return repo.repoPath || repo.path || repo.name;
}

export class GitNexusProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewId = 'ultraview.gitNexus';
    private readonly webviews = new Set<vscode.Webview>();

    constructor(
        private readonly context: vscode.ExtensionContext,
        readonly runtime: GitNexusRuntime
    ) {
        context.subscriptions.push(runtime.onDidChangeStatus(status => this.broadcast({ type: 'runtime', status })));
    }

    resolveWebviewView(view: vscode.WebviewView): void {
        this.configure(view.webview);
        this.webviews.add(view.webview);
        view.onDidDispose(() => this.webviews.delete(view.webview));
    }

    openAsPanel(): void {
        const panel = vscode.window.createWebviewPanel(
            'ultraview.gitNexusPanel',
            'GitNexus · Ultraview',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'dist'))] }
        );
        this.configure(panel.webview);
        this.webviews.add(panel.webview);
        panel.onDidDispose(() => this.webviews.delete(panel.webview));
    }

    async analyzeWorkspace(): Promise<void> {
        let webview = this.webviews.values().next().value as vscode.Webview | undefined;
        if (!webview) {
            this.openAsPanel();
            webview = this.webviews.values().next().value as vscode.Webview | undefined;
        }
        if (!webview) throw new Error('Could not open the GitNexus panel.');
        await this.analyze(webview);
    }

    private configure(webview: vscode.Webview): void {
        webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'dist'))],
        };
        webview.html = webviewHtml(this.context, webview);
        webview.onDidReceiveMessage(message => void this.handle(message as Record<string, unknown>, webview));
    }

    private broadcast(message: unknown): void {
        for (const webview of this.webviews) void webview.postMessage(message);
    }

    private async refresh(webview: vscode.Webview, requestedRepository?: string): Promise<void> {
        await this.runtime.start();
        const repositories = await this.runtime.client.repositories();
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const match = repositories.find(repo => {
            const candidate = repo.repoPath || repo.path;
            return candidate && workspacePath && path.resolve(candidate).toLowerCase() === path.resolve(workspacePath).toLowerCase();
        });
        const selected = requestedRepository || (match ? repoSelector(match) : repositories[0] ? repoSelector(repositories[0]) : undefined);
        let snapshot: GitNexusSnapshot = {
            repository: selected,
            repositories,
            graph: { nodes: [], relationships: [] },
            clusters: [],
            processes: [],
        };
        if (selected) {
            const [graph, clusters, processes] = await Promise.all([
                this.runtime.client.graph(selected),
                this.runtime.client.clusters(selected).catch(() => []),
                this.runtime.client.processes(selected).catch(() => []),
            ]);
            snapshot = { ...snapshot, graph, clusters, processes };
        }
        await webview.postMessage({ type: 'snapshot', snapshot, status: await this.runtime.status() });
    }

    private async analyze(webview: vscode.Webview): Promise<void> {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspacePath) throw new Error('Open a project folder before analyzing it.');
        await this.runtime.start();
        const embeddings = vscode.workspace.getConfiguration('ultraview.gitNexus').get<boolean>('embeddings', false);
        const job = await this.runtime.client.analyze(workspacePath, embeddings);
        for (;;) {
            const result = await this.runtime.client.analysis(job.jobId);
            await webview.postMessage({ type: 'analysisProgress', job: result });
            const status = String(result.status ?? '');
            if (status === 'complete' || status === 'completed') break;
            if (status === 'failed' || status === 'cancelled') throw new Error(String(result.error ?? `Analysis ${status}`));
            await new Promise(resolve => setTimeout(resolve, 750));
        }
        await this.refresh(webview);
    }

    private async updateVendor(): Promise<void> {
        const script = path.join(this.context.extensionPath, 'scripts', 'update-gitnexus.mjs');
        const vendorGit = path.join(this.context.extensionPath, 'vendor', 'GitNexus', '.git');
        if (!fs.existsSync(script) || !fs.existsSync(vendorGit)) {
            throw new Error('Upstream updates are available in an Ultraview source checkout. Packaged builds use the pinned local GitNexus runtime.');
        }
        const terminal = vscode.window.createTerminal({ name: 'Update GitNexus', cwd: vscode.Uri.file(this.context.extensionPath) });
        terminal.show();
        terminal.sendText('npm run pull:gitnexus');
    }

    private async handle(message: Record<string, unknown>, webview: vscode.Webview): Promise<void> {
        try {
            switch (message.type) {
                case 'ready':
                case 'refresh':
                    await webview.postMessage({ type: 'runtime', status: await this.runtime.status() });
                    if (message.type === 'refresh' || vscode.workspace.getConfiguration('ultraview.gitNexus').get<boolean>('autoStart', true)) {
                        await this.refresh(webview, typeof message.repository === 'string' ? message.repository : undefined);
                    }
                    break;
                case 'selectRepository':
                    await this.refresh(webview, String(message.repository));
                    break;
                case 'start':
                    await this.refresh(webview);
                    break;
                case 'stop':
                    this.runtime.stop();
                    break;
                case 'analyze':
                    await this.analyze(webview);
                    break;
                case 'search': {
                    const results = await this.runtime.client.search(String(message.repository), String(message.query));
                    await webview.postMessage({ type: 'searchResults', results });
                    break;
                }
                case 'openFile': {
                    const filePath = String(message.path ?? '');
                    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
                    const absolute = path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath);
                    const document = await vscode.workspace.openTextDocument(absolute);
                    const editor = await vscode.window.showTextDocument(document);
                    const line = Math.max(0, Number(message.line ?? 1) - 1);
                    editor.selection = new vscode.Selection(line, 0, line, 0);
                    editor.revealRange(new vscode.Range(line, 0, line, 0));
                    break;
                }
                case 'openCli':
                    await this.runtime.openCli();
                    break;
                case 'startMcp':
                    await this.runtime.startMcp();
                    break;
                case 'install':
                    await this.runtime.install();
                    await this.refresh(webview);
                    break;
                case 'updateVendor':
                    await this.updateVendor();
                    break;
            }
        } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            await webview.postMessage({ type: 'error', message: messageText });
            void vscode.window.showErrorMessage(`GitNexus: ${messageText}`);
        }
    }

    dispose(): void {
        this.webviews.clear();
    }
}
