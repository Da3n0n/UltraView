import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './gitNexusApp.css';

interface RuntimeStatus {
    running: boolean;
    managed: boolean;
    installing: boolean;
    port: number;
    version?: string;
    message: string;
}

interface IntegrationInfo {
    nodePath: string;
    cliPath: string;
    workspacePath: string;
    mcpPort: number;
}

const vscode = (window as unknown as {
    __vscodeApi: { postMessage(message: Record<string, unknown>): void };
}).__vscodeApi;

function embeddedThemeUrl(rawUrl: string, transparent: boolean): string {
    const url = new URL(rawUrl);
    const styles = getComputedStyle(document.documentElement);
    const variables: Record<string, string> = {
        'uv-editor-bg': '--vscode-editor-background',
        'uv-editor-fg': '--vscode-editor-foreground',
        'uv-sidebar-bg': '--vscode-sideBar-background',
        'uv-input-bg': '--vscode-input-background',
        'uv-list-hover-bg': '--vscode-list-hoverBackground',
        'uv-panel-border': '--vscode-panel-border',
        'uv-input-border': '--vscode-input-border',
        'uv-description-fg': '--vscode-descriptionForeground',
        'uv-font-family': '--vscode-font-family',
    };
    url.searchParams.set('ultraview', '1');
    if (transparent) url.searchParams.set('uv-transparent', '1');
    for (const [parameter, variable] of Object.entries(variables)) {
        const value = styles.getPropertyValue(variable).trim();
        if (value) url.searchParams.set(parameter, value);
    }
    return url.toString();
}

function App(): React.ReactElement {
    const [status, setStatus] = useState<RuntimeStatus>({ running: false, managed: false, installing: false, port: 4747, message: 'Preparing local GitNexus…' });
    const [frameUrl, setFrameUrl] = useState('');
    const [frameKey, setFrameKey] = useState(0);
    const [busy, setBusy] = useState(true);
    const [message, setMessage] = useState('Starting the bundled runtime…');
    const [error, setError] = useState('');
    const [canUpdateVendor, setCanUpdateVendor] = useState(false);
    const [integration, setIntegration] = useState<IntegrationInfo>();
    const [guide, setGuide] = useState<'cli' | 'mcp' | null>(null);
    const [copied, setCopied] = useState('');

    useEffect(() => {
        const listener = (event: MessageEvent) => {
            const payload = event.data ?? {};
            if (payload.type === 'runtime') {
                setStatus(payload.status);
                if (payload.status?.installing) {
                    setBusy(true);
                    setMessage('Preparing the bundled GitNexus runtime for first use…');
                }
            }
            if (payload.type === 'analysisProgress') {
                const job = payload.job ?? {};
                setBusy(true);
                setMessage(String(job.progress?.message ?? job.progress?.phase ?? job.status ?? 'Analyzing the open project…'));
            }
            if (payload.type === 'serverReady') {
                setStatus(payload.status);
                setFrameUrl(embeddedThemeUrl(String(payload.url), Boolean(payload.transparent)));
                setFrameKey(key => key + 1);
                setBusy(true);
                setMessage(payload.autoAnalyzed ? 'Opening the newly indexed project…' : 'Opening the local project…');
                setError('');
                setCanUpdateVendor(Boolean(payload.canUpdateVendor));
                setIntegration(payload.integration);
            }
            if (payload.type === 'stopped') {
                setFrameUrl('');
                setBusy(false);
                setMessage('The local GitNexus server is stopped.');
            }
            if (payload.type === 'error') {
                setBusy(false);
                setError(String(payload.message ?? 'GitNexus could not start.'));
            }
        };
        window.addEventListener('message', listener);
        vscode.postMessage({ type: 'ready' });
        return () => window.removeEventListener('message', listener);
    }, []);

    const start = useCallback(() => {
        setBusy(true);
        setError('');
        setMessage('Starting the bundled runtime and opening this project…');
        vscode.postMessage({ type: 'start' });
    }, []);

    const analyze = useCallback(() => {
        setBusy(true);
        setError('');
        setMessage('Analyzing the complete open workspace…');
        vscode.postMessage({ type: 'analyze' });
    }, []);

    const copy = useCallback(async (label: string, value: string) => {
        await navigator.clipboard.writeText(value);
        setCopied(label);
        window.setTimeout(() => setCopied(''), 1400);
    }, []);

    const psQuote = (value: string) => `"${value.replace(/"/g, '`"')}"`;
    const cliCommand = integration ? `& ${psQuote(integration.nodePath)} ${psQuote(integration.cliPath)}` : '';
    const stdioEntry = integration ? {
        command: integration.nodePath,
        args: [integration.cliPath, 'mcp'],
        env: {
            GITNEXUS_MCP_ALLOWED_REPOS: integration.workspacePath,
            GITNEXUS_MCP_DEFAULT_REPO: integration.workspacePath,
        },
    } : undefined;
    const jsonConfig = stdioEntry ? JSON.stringify({ mcpServers: { gitnexus: stdioEntry } }, null, 2) : '';
    const codexConfig = stdioEntry ? [
        '[mcp_servers.gitnexus]',
        `command = ${JSON.stringify(stdioEntry.command)}`,
        `args = ${JSON.stringify(stdioEntry.args)}`,
        `env = { GITNEXUS_MCP_ALLOWED_REPOS = ${JSON.stringify(integration!.workspacePath)}, GITNEXUS_MCP_DEFAULT_REPO = ${JSON.stringify(integration!.workspacePath)} }`,
    ].join('\n') : '';

    return <div className="shell">
        <header>
            <div className="brand"><span>GN</span><strong>GitNexus</strong><small>original local UI</small></div>
            <div className={`status ${status.running ? 'online' : ''}`} title={status.message}>
                <i />{status.installing ? 'Preparing' : status.running ? `Local · ${status.port}` : 'Stopped'}
            </div>
            <button className="primary" onClick={analyze} disabled={!status.running || busy}>Analyze workspace</button>
            <button onClick={() => setFrameKey(key => key + 1)} disabled={!frameUrl}>Reload UI</button>
            <button onClick={() => setGuide('cli')} disabled={!integration}>CLI guide</button>
            <button onClick={() => setGuide('mcp')} disabled={!integration}>MCP setup</button>
            {canUpdateVendor && <button title="Pull pinned upstream source without overwriting Ultraview customizations" onClick={() => vscode.postMessage({ type: 'updateVendor' })}>Update</button>}
            {status.running
                ? <button onClick={() => vscode.postMessage({ type: 'stop' })}>Stop</button>
                : <button className="primary" onClick={start}>Start</button>}
        </header>
        <main>
            {frameUrl && <iframe key={frameKey} src={frameUrl} title="GitNexus" allow="clipboard-read; clipboard-write" onLoad={() => { setBusy(false); setMessage(''); }} />}
            {!frameUrl && !busy && !error && <div className="empty">
                <div className="orb">⌘</div>
                <h2>GitNexus is ready when you are</h2>
                <p>The runtime and complete original UI are bundled with Ultraview. Start it to analyze and open the current local project.</p>
                <button className="primary large" onClick={start}>Start GitNexus</button>
            </div>}
            {(busy || error) && <div className="overlay">
                {busy && <i className="spinner" />}
                <strong>{error ? 'GitNexus could not open' : 'GitNexus'}</strong>
                <p>{error || message}</p>
                {error && <button className="primary" onClick={start}>Retry</button>}
            </div>}
        </main>
        {guide && integration && <div className="guide-backdrop" onMouseDown={event => event.target === event.currentTarget && setGuide(null)}>
            <section className="guide" role="dialog" aria-modal="true" aria-label={guide === 'cli' ? 'GitNexus CLI guide' : 'GitNexus MCP setup'}>
                <div className="guide-title"><div><strong>{guide === 'cli' ? 'GitNexus CLI' : 'Connect an AI model with MCP'}</strong><small>Scoped to {integration.workspacePath}</small></div><button onClick={() => setGuide(null)}>Close</button></div>
                {guide === 'cli' ? <>
                    <p>Run the bundled CLI from PowerShell. The leading <code>&amp;</code> is required when an executable path is quoted.</p>
                    <Snippet label="PowerShell" value={`${cliCommand} --help`} copied={copied} onCopy={copy} />
                    <h3>Useful commands</h3>
                    <Snippet label="Index status" value={`${cliCommand} status`} copied={copied} onCopy={copy} />
                    <Snippet label="Analyze this workspace" value={`${cliCommand} analyze ${psQuote(integration.workspacePath)} --index-only`} copied={copied} onCopy={copy} />
                    <Snippet label="Explore a symbol" value={`${cliCommand} context GitNexusProvider --repo ${psQuote(integration.workspacePath)}`} copied={copied} onCopy={copy} />
                </> : <>
                    <p><b>Recommended:</b> use stdio MCP. Your AI client starts the bundled GitNexus process only when needed, and the environment below limits it to this open workspace.</p>
                    <h3>Codex · <code>~/.codex/config.toml</code></h3>
                    <Snippet label="Codex config" value={codexConfig} copied={copied} onCopy={copy} />
                    <h3>Claude Code, Cursor and JSON MCP clients</h3>
                    <p>Add this entry to Claude Code’s <code>~/.claude.json</code>, Cursor’s <code>~/.cursor/mcp.json</code>, or the equivalent MCP configuration.</p>
                    <Snippet label="JSON config" value={jsonConfig} copied={copied} onCopy={copy} />
                    <h3>Optional HTTP transport</h3>
                    <p>For clients that require a URL, start the server from the Command Palette with <b>Ultraview: Start GitNexus MCP Server</b>, then connect to <code>http://127.0.0.1:{integration.mcpPort}/mcp</code>.</p>
                </>}
            </section>
        </div>}
    </div>;
}

function Snippet({ label, value, copied, onCopy }: { label: string; value: string; copied: string; onCopy(label: string, value: string): void }): React.ReactElement {
    return <div className="snippet"><pre>{value}</pre><button onClick={() => onCopy(label, value)}>{copied === label ? 'Copied' : 'Copy'}</button></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
