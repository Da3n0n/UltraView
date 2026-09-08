import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { GitNexusClient } from './client';
import type { GitNexusRuntimeStatus } from './types';

const execFileAsync = promisify(execFile);
const RUNTIME_LAYOUT_VERSION = 3;
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
    private installController?: AbortController;
    private pinCache?: { version: string; commit: string; customizationFingerprint: string };
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
                needsDownload: !this.findCli(),
                managed: false,
                installing: Boolean(this.installing),
                port: this.port,
                message: this.installing ? 'Preparing GitNexus runtime…' : 'Local server is stopped',
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
            throw new Error('The GitNexus Node runtime could not start. Set ultraview.gitNexus.nodePath to Node.js 22.18+.');
        }
        if (!validNodeVersion(stdout)) {
            throw new Error(`GitNexus needs Node.js 22.18+ (or 24.11+); found ${stdout.trim()}.`);
        }
        return node;
    }

    private cliCandidates(): string[] {
        return [
            ...(this.runtimeMatches(this.extractedRuntimeRoot()) ? [path.join(this.extractedRuntimeRoot(), 'node_modules', 'gitnexus', 'dist', 'cli', 'index.js')] : []),
            path.join(this.context.extensionPath, 'vendor', 'GitNexus', 'gitnexus', 'dist', 'cli', 'index.js'),
        ];
    }

    private findCli(): string | undefined {
        return this.cliCandidates().find(candidate => fs.existsSync(candidate));
    }

    private runtimePin(): { version: string; commit: string; customizationFingerprint: string } {
        if (this.pinCache) return this.pinCache;
        const manifest = path.join(this.context.extensionPath, 'resources', 'gitnexus-version.json');
        try {
            const pin = JSON.parse(fs.readFileSync(manifest, 'utf8'));
            const archiveMarker = JSON.parse(fs.readFileSync(path.join(this.context.extensionPath, 'resources', 'gitnexus-downloads.json'), 'utf8'));
            return this.pinCache = {
                version: String(pin.version),
                commit: String(pin.commit),
                customizationFingerprint: String(archiveMarker.customizationFingerprint ?? 'base'),
            };
        } catch {
            return { version: '1.6.10', commit: 'unknown', customizationFingerprint: 'base' };
        }
    }

    private runtimeMatches(root: string): boolean {
        try {
            const marker = JSON.parse(fs.readFileSync(path.join(root, 'runtime.json'), 'utf8'));
            const pin = this.runtimePin();
            return marker.version === pin.version && marker.commit === pin.commit
                && marker.customizationFingerprint === pin.customizationFingerprint
                && marker.platform === `${process.platform}-${process.arch}`
                && fs.existsSync(path.join(root, 'node_modules', 'gitnexus', 'dist', 'cli', 'index.js'))
                && fs.existsSync(path.join(root, 'node', process.platform === 'win32' ? 'node.exe' : 'node'));
        } catch { return false; }
    }

    private extractedRuntimeRoot(): string {
        const pin = this.runtimePin();
        const root = (layout: number) => path.join(this.context.globalStorageUri.fsPath, `runtime-${pin.version}-${pin.commit.slice(0, 12)}-r${layout}-u${pin.customizationFingerprint.slice(0, 12)}`);
        const current = root(RUNTIME_LAYOUT_VERSION);
        if (this.runtimeMatches(current)) return current;
        const previous = root(2);
        return this.runtimeMatches(previous) ? previous : current;
    }

    async install(): Promise<string> {
        if (this.findCli()) return this.findCli()!;
        if (this.installing) return this.installing;
        this.installing = (async () => {
            this.installController = new AbortController();
            const signal = this.installController.signal;
            await fs.promises.mkdir(this.context.globalStorageUri.fsPath, { recursive: true });
            const pin = this.runtimePin();
            const destination = this.extractedRuntimeRoot();
            this.changed.fire(await this.status());
            const unlock = await this.lockInstallation(destination, signal);
            let staging: string | undefined;
            try {
                const existing = this.findCli();
                if (existing) return existing;
                this.changed.fire(await this.status());
                const archive = await this.obtainArchive(signal);
                this.output.show(true);
                this.output.appendLine(`Preparing GitNexus ${pin.version} for first use…`);
                this.changed.fire(await this.status());
                staging = await fs.promises.mkdtemp(destination + '.staging-');
                await new Promise<void>((resolve, reject) => {
                    const child = spawn('tar', ['-xzf', archive, '-C', staging!], { windowsHide: true, signal });
                    let failure: Error | undefined;
                    child.stdout?.on('data', data => this.output.append(data.toString()));
                    child.stderr?.on('data', data => this.output.append(data.toString()));
                    child.once('error', error => { failure = error; });
                    child.once('close', code => failure ? reject(failure) : code === 0 ? resolve() : reject(new Error(`Runtime extraction exited with code ${code}`)));
                });
                const stagedCli = path.join(staging, 'node_modules', 'gitnexus', 'dist', 'cli', 'index.js');
                await fs.promises.access(stagedCli);
                await fs.promises.access(path.join(staging, 'node', process.platform === 'win32' ? 'node.exe' : 'node'));
                if (!this.runtimeMatches(staging)) throw new Error('Runtime archive does not match the expected version or platform.');
                signal.throwIfAborted();
                // Only completed installs become visible to other windows.
                await fs.promises.rm(destination, { recursive: true, force: true });
                await fs.promises.rename(staging, destination);
                staging = undefined;
                const cli = this.findCli();
                if (!cli) throw new Error('The GitNexus runtime was extracted, but its CLI could not be found.');
                this.output.appendLine('GitNexus runtime is ready.');
                return cli;
            } finally {
                if (staging) await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => {});
                await unlock();
            }
        })();
        try {
            return await this.installing;
        } finally {
            this.installing = undefined;
            this.installController = undefined;
            this.changed.fire(await this.status());
        }
    }

    cancelInstall(): void { this.installController?.abort(); }

    private async lockInstallation(destination: string, signal: AbortSignal): Promise<() => Promise<void>> {
        const lock = destination + '.lock';
        const deadline = Date.now() + 10 * 60_000;
        while (true) {
            signal.throwIfAborted();
            try {
                const handle = await fs.promises.open(lock, 'wx');
                await handle.writeFile(String(process.pid));
                await handle.close();
                return () => fs.promises.unlink(lock).catch(() => {});
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
                try {
                    const owner = Number(await fs.promises.readFile(lock, 'utf8'));
                    if (owner > 0) {
                        try { process.kill(owner, 0); }
                        catch (probe) {
                            if ((probe as NodeJS.ErrnoException).code === 'ESRCH') {
                                await fs.promises.unlink(lock);
                                continue;
                            }
                        }
                    } else if (Date.now() - (await fs.promises.stat(lock)).mtimeMs > 60_000) {
                        await fs.promises.unlink(lock);
                        continue;
                    }
                } catch { /* lock owner may be initializing/releasing it */ }
                if (Date.now() >= deadline) throw new Error('Another window is installing GitNexus. Try again after it finishes.');
                await new Promise(resolve => setTimeout(resolve, 250));
            }
        }
    }

    private async obtainArchive(signal: AbortSignal): Promise<string> {
        const manifestPath = path.join(this.context.extensionPath, 'resources', 'gitnexus-downloads.json');
        let entry: { url: string; sha256: string };
        try {
            const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
            const pin = this.runtimePin();
            if (manifest.commit !== pin.commit || manifest.customizationFingerprint !== pin.customizationFingerprint) throw new Error('Runtime version mismatch.');
            entry = manifest.platforms[`${process.platform}-${process.arch}`];
            if (!entry || !/^[a-f0-9]{64}$/i.test(entry.sha256) || new URL(entry.url).protocol !== 'https:') throw new Error('Invalid runtime download.');
        } catch {
            throw new Error('No verified GitNexus runtime download is available for this platform in this version of Ultraview. Other Ultraview features remain available.');
        }
        const archive = path.join(this.context.globalStorageUri.fsPath, `download-${entry.sha256}.tar.gz`);
        const digest = async (file: string) => {
            const hash = createHash('sha256');
            for await (const chunk of fs.createReadStream(file)) { signal.throwIfAborted(); hash.update(chunk); }
            return hash.digest('hex');
        };
        if (fs.existsSync(archive) && await digest(archive) === entry.sha256.toLowerCase()) return archive;
        const temporary = archive + `.${process.pid}.part`;
        this.output.show(true);
        this.output.appendLine('Downloading the GitNexus runtime…');
        try {
            const response = await fetch(entry.url, { signal });
            if (!response.ok || !response.body) throw new Error(`Runtime download failed (${response.status}).`);
            let bytes = 0;
            let lastProgress = 0;
            const progress = new Transform({ transform: (chunk, _encoding, callback) => {
                bytes += chunk.length;
                if (Date.now() - lastProgress > 500) {
                    lastProgress = Date.now();
                    this.changed.fire({ running: false, managed: false, installing: true, port: this.port,
                        message: `Downloading runtime: ${(bytes / 1048576).toFixed(1)} MiB` });
                }
                callback(null, chunk);
            } });
            await pipeline(Readable.fromWeb(response.body as any), progress, fs.createWriteStream(temporary), { signal });
            if (await digest(temporary) !== entry.sha256.toLowerCase()) throw new Error('Runtime download checksum mismatch. Retry the download.');
            await fs.promises.rm(archive, { force: true });
            await fs.promises.rename(temporary, archive);
            return archive;
        } finally { await fs.promises.rm(temporary, { force: true }).catch(() => {}); }
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
        if ((await this.status()).running) {
            const activeRuntime = this.context.globalState.get<string>(SERVER_RUNTIME_KEY);
            if (!activeRuntime || activeRuntime === this.extractedRuntimeRoot()) return;
            await this.terminateRunningServer();
        }
        const cli = this.findCli() ?? await this.install();
        const node = await this.assertNode();
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
                if (!entry.isDirectory() || !entry.name.startsWith('runtime-') || entry.name.includes('.staging-')) continue;
                const candidate = path.resolve(this.context.globalStorageUri.fsPath, entry.name);
                if (candidate.toLowerCase() === current) continue;
                if (fs.existsSync(candidate + '.lock')) continue;
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
    } | undefined> {
        const cliPath = this.findCli();
        if (!cliPath) return undefined;
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
        this.cancelInstall();
        this.stop();
        this.changed.dispose();
        this.output.dispose();
    }
}
