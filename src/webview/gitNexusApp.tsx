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

const vscode = (window as unknown as {
    __vscodeApi: { postMessage(message: Record<string, unknown>): void };
}).__vscodeApi;

function App(): React.ReactElement {
    const [status, setStatus] = useState<RuntimeStatus>({ running: false, managed: false, installing: false, port: 4747, message: 'Preparing local GitNexus…' });
    const [frameUrl, setFrameUrl] = useState('');
    const [frameKey, setFrameKey] = useState(0);
    const [busy, setBusy] = useState(true);
    const [message, setMessage] = useState('Starting the bundled runtime…');
    const [error, setError] = useState('');

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
                setFrameUrl(String(payload.url));
                setFrameKey(key => key + 1);
                setBusy(true);
                setMessage(payload.autoAnalyzed ? 'Opening the newly indexed project…' : 'Opening the local project…');
                setError('');
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

    return <div className="shell">
        <header>
            <div className="brand"><span>GN</span><strong>GitNexus</strong><small>original local UI</small></div>
            <div className={`status ${status.running ? 'online' : ''}`} title={status.message}>
                <i />{status.installing ? 'Preparing' : status.running ? `Local · ${status.port}` : 'Stopped'}
            </div>
            <button className="primary" onClick={analyze} disabled={!status.running || busy}>Analyze workspace</button>
            <button onClick={() => setFrameKey(key => key + 1)} disabled={!frameUrl}>Reload UI</button>
            <button onClick={() => vscode.postMessage({ type: 'openCli' })}>CLI</button>
            <button onClick={() => vscode.postMessage({ type: 'startMcp' })}>MCP</button>
            <button title="Pull pinned upstream source without overwriting Ultraview customizations" onClick={() => vscode.postMessage({ type: 'updateVendor' })}>Update</button>
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
    </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
