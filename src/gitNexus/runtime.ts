import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { GitNexusClient } from './client';
import type { GitNexusRuntimeStatus } from './types';

const execFileAsync = promisify(execFile);
const RUNTIME_LAYOUT_VERSION = 2;
const SERVER_PID_KEY = 'ultraview.gitNexus.serverPid';
const SERVER_RUNTIME_KEY = 'ultraview.gitNexus.serverRuntime';
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
    private starting?: Promise<void>;
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
            path.join(this.extractedRuntimeRoot(), 'node_modules', 'gitnexus', 'dist', 'cli', 'index.js'),
            path.join(this.context.extensionPath, 'vendor', 'GitNexus', 'gitnexus', 'dist', 'cli', 'index.js'),
            path.join(this.context.globalStorageUri.fsPath, 'node_modules', 'gitnexus', 'dist', 'cli', 'index.js'),
        ];
    }

    private findCli(): string | undefined {
        return this.cliCandidates().find(candidate => fs.existsSync(candidate));
    }

    private runtimePin(): { version: string; commit: string; customizationFingerprint: string } {
        const manifest = path.join(this.context.extensionPath, 'resources', 'gitnexus-version.json');
        try {
            const pin = JSON.parse(fs.readFileSync(manifest, 'utf8'));
            const archiveMarker = JSON.parse(fs.readFileSync(path.join(this.context.extensionPath, 'resources', 'gitnexus-runtime-archive.json'), 'utf8'));
            return {
                version: String(pin.version),
                commit: String(pin.commit),
                customizationFingerprint: String(archiveMarker.customizationFingerprint ?? 'base'),
            };
        } catch {
            return { version: '1.6.10', commit: 'unknown', customizationFingerprint: 'base' };
        }
    }

    private extractedRuntimeRoot(): string {
        const pin = this.runtimePin();
        return path.join(this.context.globalStorageUri.fsPath, `runtime-${pin.version}-${pin.commit.slice(0, 12)}-r${RUNTIME_LAYOUT_VERSION}-u${pin.customizationFingerprint.slice(0, 12)}`);
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
        if (this.starting) return this.starting;
        const starting = this.startOnce();
        this.starting = starting;
        try {
            await starting;
        } finally {
            if (this.starting === starting) this.starting = undefined;
        }
    }

    private async startOnce(): Promise<void> {
        const cli = this.findCli() ?? await this.install();
        const node = await this.assertNode();
        if ((await this.status()).running) {
            const activeRuntime = this.context.globalState.get<string>(SERVER_RUNTIME_KEY);
            if (activeRuntime === this.extractedRuntimeRoot()) return;
            await this.terminateRunningServer();
        }
        this.output.appendLine(`Starting GitNexus at http://127.0.0.1:${this.port}`);
        const child = spawn(node, [cli, 'serve', '--host', '127.0.0.1', '--port', String(this.port)], {
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? this.context.extensionPath,
            windowsHide: true,
            env: { ...process.env, NO_COLOR: '1' },
        });
        this.process = child;
        if (child.pid) await this.context.globalState.update(SERVER_PID_KEY, child.pid);
        await this.context.globalState.update(SERVER_RUNTIME_KEY, this.extractedRuntimeRoot());
        child.stdout?.on('data', data => this.output.append(data.toString()));
        child.stderr?.on('data', data => this.output.append(data.toString()));
        child.once('exit', code => {
            this.output.appendLine(`GitNexus server stopped (${code ?? 'signal'}).`);
            if (this.process === child) this.process = undefined;
            if (this.context.globalState.get<number>(SERVER_PID_KEY) === child.pid) {
                void this.context.globalState.update(SERVER_PID_KEY, undefined);
                void this.context.globalState.update(SERVER_RUNTIME_KEY, undefined);
            }
            void this.status().then(status => this.changed.fire(status));
        });
        child.once('error', error => this.output.appendLine(`Server error: ${error.message}`));

        const deadline = Date.now() + 25_000;
        while (Date.now() < deadline) {
            try {
                await this.client.health();
                this.changed.fire(await this.status());
                void this.cleanupOldExtractedRuntimes();
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
        void this.context.globalState.update(SERVER_PID_KEY, undefined);
        void this.context.globalState.update(SERVER_RUNTIME_KEY, undefined);
        void this.status().then(status => this.changed.fire(status));
    }

    async restart(checkpointWorkspace?: string): Promise<void> {
        await this.terminateRunningServer();
        if (checkpointWorkspace) await this.parkTinyCheckpointSidecars(checkpointWorkspace);
        await this.start();
    }

    private async terminateRunningServer(): Promise<void> {
        // A server left behind by a previous extension host can keep LadybugDB's
        // checkpoint open. Verify that this port is GitNexus before recycling it.
        await this.client.info();
        const pid = this.process?.pid ?? this.context.globalState.get<number>(SERVER_PID_KEY) ?? await this.findListeningPid();
        if (!pid || pid === process.pid) throw new Error('Could not identify the local GitNexus server process to restart.');

        this.output.appendLine(`Restarting GitNexus server process ${pid} to release its saved database checkpoint.`);
        try {
            process.kill(pid, 'SIGTERM');
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== 'ESRCH') throw error;
        }
        this.process = undefined;
        await this.context.globalState.update(SERVER_PID_KEY, undefined);
        await this.context.globalState.update(SERVER_RUNTIME_KEY, undefined);

        for (let attempt = 0; attempt < 20; attempt++) {
            if (!(await this.status()).running) break;
            await new Promise(resolve => setTimeout(resolve, 150));
        }
        if ((await this.status()).running) {
            process.kill(pid, 'SIGKILL');
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    private async cleanupOldExtractedRuntimes(): Promise<void> {
        const current = path.resolve(this.extractedRuntimeRoot()).toLowerCase();
        try {
            const entries = await fs.promises.readdir(this.context.globalStorageUri.fsPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || !entry.name.startsWith('runtime-')) continue;
                const candidate = path.resolve(this.context.globalStorageUri.fsPath, entry.name);
                if (candidate.toLowerCase() === current) continue;
                try {
                    await fs.promises.rm(candidate, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
                    this.output.appendLine(`Removed superseded GitNexus runtime ${entry.name}.`);
                } catch (error) {
                    this.output.appendLine(`Could not remove superseded runtime ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        } catch (error) {
            this.output.appendLine(`Could not inspect old GitNexus runtimes: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async parkTinyCheckpointSidecars(workspacePath: string): Promise<void> {
        const databasePath = path.join(workspacePath, '.gitnexus', 'lbug');
        const walPath = `${databasePath}.wal`;
        const shadowPath = `${databasePath}.shadow`;
        let wal: fs.Stats;
        try {
            wal = await fs.promises.stat(walPath);
            await fs.promises.stat(shadowPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw error;
        }
        // GitNexus itself defines <= 4 KiB as a tiny orphan WAL: it contains no
        // meaningful pending graph pages. Never park a larger WAL automatically.
        if (wal.size > 4 * 1024) {
            throw new Error(`GitNexus left a ${wal.size}-byte WAL. It is too large for safe automatic checkpoint recovery; use Analyze workspace to rebuild it.`);
        }
        const suffix = `.ultraview-recovery-${Date.now()}`;
        await fs.promises.rename(walPath, walPath + suffix);
        try {
            await fs.promises.rename(shadowPath, shadowPath + suffix);
        } catch (error) {
            await fs.promises.rename(walPath + suffix, walPath);
            throw error;
        }
        this.output.appendLine(`Parked a tiny orphan WAL and stale checkpoint sidecar for ${workspacePath}; the saved graph database was preserved.`);
    }

    private async findListeningPid(): Promise<number | undefined> {
        if (process.platform === 'win32') {
            const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp'], { windowsHide: true });
            for (const line of stdout.split(/\r?\n/)) {
                if (!/\bLISTENING\b/i.test(line)) continue;
                const parts = line.trim().split(/\s+/);
                const port = Number(parts[1]?.split(':').pop());
                const pid = Number(parts.at(-1));
                if (port === this.port && Number.isInteger(pid) && pid > 0) return pid;
            }
            return undefined;
        }
        try {
            const { stdout } = await execFileAsync('lsof', ['-tiTCP:' + this.port, '-sTCP:LISTEN'], { windowsHide: true });
            const pid = Number(stdout.trim().split(/\s+/)[0]);
            return Number.isInteger(pid) && pid > 0 ? pid : undefined;
        } catch {
            return undefined;
        }
    }

    async integrationInfo(): Promise<{
        nodePath: string;
        cliPath: string;
        workspacePath: string;
        mcpPort: number;
    }> {
        const cliPath = this.findCli() ?? await this.install();
        const nodePath = await this.assertNode();
        return {
            nodePath,
            cliPath,
            workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
            mcpPort: this.mcpPort,
        };
    }

    private async terminalCommand(args: string[], name: string): Promise<void> {
        const cli = this.findCli() ?? await this.install();
        const node = await this.assertNode();
        const terminal = vscode.window.createTerminal({
            name,
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri,
            env: args[0] === 'mcp' && vscode.workspace.workspaceFolders?.[0]
                ? {
                    GITNEXUS_MCP_ALLOWED_REPOS: vscode.workspace.workspaceFolders[0].uri.fsPath,
                    GITNEXUS_MCP_DEFAULT_REPO: vscode.workspace.workspaceFolders[0].uri.fsPath,
                }
                : undefined,
        });
        terminal.show();
        const invocation = [shellQuote(node), shellQuote(cli), ...args.map(shellQuote)].join(' ');
        const powershell = /(?:^|[\\/])(?:pwsh|powershell)(?:\.exe)?$/i.test(vscode.env.shell);
        terminal.sendText(`${powershell ? '& ' : ''}${invocation}`);
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
