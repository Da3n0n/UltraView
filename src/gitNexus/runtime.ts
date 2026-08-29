import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { GitNexusClient } from './client';
import type { GitNexusRuntimeStatus } from './types';

const execFileAsync = promisify(execFile);
const RUNTIME_LAYOUT_VERSION = 2;
function shellQuote(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
}

function validNodeVersion(raw: string): boolean {
    const match = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
    if (!match) return false;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    return major >= 25 || (major === 24 && minor >= 11) || (major === 22 && minor >= 18);
}

export class GitNexusRuntime implements vscode.Disposable {
    private process?: ChildProcess;
    private installing?: Promise<string>;
    private readonly output = vscode.window.createOutputChannel('Ultraview GitNexus');
    private readonly changed = new vscode.EventEmitter<GitNexusRuntimeStatus>();
    readonly onDidChangeStatus = this.changed.event;

    constructor(private readonly context: vscode.ExtensionContext) {}

    get port(): number {
        return vscode.workspace.getConfiguration('ultraview.gitNexus').get<number>('port', 4747);
    }

    get mcpPort(): number {
        return vscode.workspace.getConfiguration('ultraview.gitNexus').get<number>('mcpPort', 3000);
    }

    get client(): GitNexusClient {
        return new GitNexusClient(this.port);
    }

    async status(): Promise<GitNexusRuntimeStatus> {
        try {
            const info = await this.client.info();
            return {
                running: true,
                managed: Boolean(this.process),
                installing: Boolean(this.installing),
                port: this.port,
                version: info.version,
                nodeVersion: info.nodeVersion,
                message: this.process ? 'Managed local server is ready' : 'Connected to local GitNexus server',
            };
        } catch {
            return {
                running: false,
                managed: false,
                installing: Boolean(this.installing),
                port: this.port,
                message: this.installing ? 'Preparing bundled GitNexus runtime…' : 'Local server is stopped',
            };
        }
    }

    private nodeExecutable(): string {
        const configured = vscode.workspace.getConfiguration('ultraview.gitNexus').get<string>('nodePath', '').trim();
        if (configured) return configured;
        const bundled = path.join(
            this.extractedRuntimeRoot(),
            'node',
            process.platform === 'win32' ? 'node.exe' : 'node'
        );
        return fs.existsSync(bundled) ? bundled : 'node';
    }

    private async assertNode(): Promise<string> {
        const node = this.nodeExecutable();
        let stdout = '';
        try {
            ({ stdout } = await execFileAsync(node, ['--version'], { windowsHide: true }));
        } catch {
            throw new Error('The bundled GitNexus Node runtime could not start. Reinstall Ultraview, or set ultraview.gitNexus.nodePath to Node.js 22.18+.');
        }
        if (!validNodeVersion(stdout)) {
            throw new Error(`GitNexus needs Node.js 22.18+ (or 24.11+); found ${stdout.trim()}.`);
        }
        return node;
    }

    private cliCandidates(): string[] {
        return [
            path.join(this.context.extensionPath, 'vendor', 'GitNexus', 'gitnexus', 'dist', 'cli', 'index.js'),
            path.join(this.extractedRuntimeRoot(), 'node_modules', 'gitnexus', 'dist', 'cli', 'index.js'),
            path.join(this.context.globalStorageUri.fsPath, 'node_modules', 'gitnexus', 'dist', 'cli', 'index.js'),
        ];
    }

    private findCli(): string | undefined {
        return this.cliCandidates().find(candidate => fs.existsSync(candidate));
    }

    private runtimePin(): { version: string; commit: string } {
        const manifest = path.join(this.context.extensionPath, 'resources', 'gitnexus-version.json');
        try {
            const pin = JSON.parse(fs.readFileSync(manifest, 'utf8'));
            return { version: String(pin.version), commit: String(pin.commit) };
        } catch {
            return { version: '1.6.10', commit: 'unknown' };
        }
    }

    private extractedRuntimeRoot(): string {
        const pin = this.runtimePin();
        return path.join(this.context.globalStorageUri.fsPath, `runtime-${pin.version}-${pin.commit.slice(0, 12)}-r${RUNTIME_LAYOUT_VERSION}`);
    }

    private runtimeArchive(): string {
        return path.join(
            this.context.extensionPath,
            'resources',
            `gitnexus-runtime-${process.platform}-${process.arch}.tar.gz`
        );
    }

    async install(): Promise<string> {
        if (this.findCli()) return this.findCli()!;
        if (this.installing) return this.installing;
        this.installing = (async () => {
            await fs.promises.mkdir(this.context.globalStorageUri.fsPath, { recursive: true });
            const pin = this.runtimePin();
            const archive = this.runtimeArchive();
            if (!fs.existsSync(archive)) {
                throw new Error('The bundled GitNexus runtime is missing. Reinstall Ultraview.');
            }
            const destination = this.extractedRuntimeRoot();
            this.output.show(true);
            this.output.appendLine(`Preparing bundled GitNexus ${pin.version} for first use…`);
            this.changed.fire(await this.status());
            await fs.promises.rm(destination, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
            await fs.promises.mkdir(destination, { recursive: true });
            await new Promise<void>((resolve, reject) => {
                const child = spawn('tar', ['-xzf', archive, '-C', destination], { windowsHide: true });
                child.stdout?.on('data', data => this.output.append(data.toString()));
                child.stderr?.on('data', data => this.output.append(data.toString()));
                child.once('error', reject);
                child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Bundled runtime extraction exited with code ${code}`)));
            });
            const cli = this.findCli();
            if (!cli) throw new Error('The bundled GitNexus runtime was extracted, but its CLI could not be found.');
            this.output.appendLine('Bundled GitNexus runtime is ready.');
            return cli;
        })();
        try {
            return await this.installing;
        } finally {
            this.installing = undefined;
            this.changed.fire(await this.status());
        }
    }

    async start(): Promise<void> {
        if ((await this.status()).running) return;
        const cli = this.findCli() ?? await this.install();
        const node = await this.assertNode();
        this.output.appendLine(`Starting GitNexus at http://127.0.0.1:${this.port}`);
        this.process = spawn(node, [cli, 'serve', '--host', '127.0.0.1', '--port', String(this.port)], {
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? this.context.extensionPath,
            windowsHide: true,
            env: { ...process.env, NO_COLOR: '1' },
        });
        this.process.stdout?.on('data', data => this.output.append(data.toString()));
        this.process.stderr?.on('data', data => this.output.append(data.toString()));
        this.process.once('exit', code => {
            this.output.appendLine(`GitNexus server stopped (${code ?? 'signal'}).`);
            this.process = undefined;
            void this.status().then(status => this.changed.fire(status));
        });
        this.process.once('error', error => this.output.appendLine(`Server error: ${error.message}`));

        const deadline = Date.now() + 25_000;
        while (Date.now() < deadline) {
            try {
                await this.client.health();
                this.changed.fire(await this.status());
                return;
            } catch {
                await new Promise(resolve => setTimeout(resolve, 350));
            }
        }
        this.stop();
        throw new Error('GitNexus did not become ready within 25 seconds. See the Ultraview GitNexus output channel.');
    }

    stop(): void {
        this.process?.kill();
        this.process = undefined;
        void this.status().then(status => this.changed.fire(status));
    }

    private async terminalCommand(args: string[], name: string): Promise<void> {
        const cli = this.findCli() ?? await this.install();
        const node = await this.assertNode();
        const terminal = vscode.window.createTerminal({
            name,
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri,
        });
        terminal.show();
        terminal.sendText([shellQuote(node), shellQuote(cli), ...args.map(shellQuote)].join(' '));
    }

    openCli(): Promise<void> {
        return this.terminalCommand([], 'GitNexus CLI');
    }

    startMcp(): Promise<void> {
        return this.terminalCommand(['mcp', '--http', '--host', '127.0.0.1', '--port', String(this.mcpPort)], 'GitNexus MCP');
    }

    dispose(): void {
        this.stop();
        this.changed.dispose();
        this.output.dispose();
    }
}
