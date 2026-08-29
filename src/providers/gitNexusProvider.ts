import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitNexusRuntime } from '../gitNexus/runtime';

function webviewHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
    const script = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'dist', 'gitNexus.next.js')));
    const nonce = Math.random().toString(36).slice(2);
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; frame-src http: https:;">
  <title>GitNexus</title>
  <style>html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground)}</style>
</head>
<body><div id="root"></div><script nonce="${nonce}">window.__vscodeApi=acquireVsCodeApi();</script><script nonce="${nonce}" src="${script}"></script></body>
</html>`;
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

    private async openOriginalUi(webview: vscode.Webview): Promise<void> {
        await this.runtime.start();
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        let autoAnalyzed = false;

        if (workspacePath) {
            const repositories = await this.runtime.client.repositories();
            const indexed = repositories.some(repo => {
                const candidate = repo.repoPath || repo.path;
                return Boolean(candidate) && path.resolve(candidate!).toLowerCase() === path.resolve(workspacePath).toLowerCase();
            });
            if (!indexed) {
                autoAnalyzed = true;
                await this.analyze(webview, false);
            }
        }

        const server = await vscode.env.asExternalUri(vscode.Uri.parse(`http://127.0.0.1:${this.runtime.port}`));
        const serverUrl = server.toString(true).replace(/\/$/, '');
        const url = new URL(`${serverUrl}/`);
        url.searchParams.set('server', serverUrl);
        if (workspacePath) url.searchParams.set('repo', workspacePath);
        await webview.postMessage({ type: 'serverReady', url: url.toString(), status: await this.runtime.status(), autoAnalyzed });
    }

    private async analyze(webview: vscode.Webview, reopen = true): Promise<void> {
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
        if (reopen) await this.openOriginalUi(webview);
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
                    await webview.postMessage({ type: 'runtime', status: await this.runtime.status() });
                    if (vscode.workspace.getConfiguration('ultraview.gitNexus').get<boolean>('autoStart', true)) {
                        await this.openOriginalUi(webview);
                    }
                    break;
                case 'refresh':
                case 'start':
                    await this.openOriginalUi(webview);
                    break;
                case 'stop':
                    this.runtime.stop();
                    await webview.postMessage({ type: 'stopped' });
                    break;
                case 'analyze':
                    await this.analyze(webview);
                    break;
                case 'openCli':
                    await this.runtime.openCli();
                    break;
                case 'startMcp':
                    await this.runtime.startMcp();
                    break;
                case 'install':
                    await this.runtime.install();
                    await this.openOriginalUi(webview);
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
