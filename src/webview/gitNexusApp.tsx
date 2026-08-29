import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './gitNexusApp.css';

interface GNode { id: string; label: string; properties?: { name?: string; filePath?: string; startLine?: number; language?: string; [key: string]: unknown } }
interface GRelationship { id: string; sourceId: string; targetId: string; type: string }
interface Repository { name: string; path?: string; repoPath?: string; stats?: Record<string, number> }
interface Snapshot { repository?: string; repositories: Repository[]; graph: { nodes: GNode[]; relationships: GRelationship[] }; clusters: unknown[]; processes: unknown[] }
interface RuntimeStatus { running: boolean; managed: boolean; installing: boolean; port: number; version?: string; nodeVersion?: string; message: string }

const vscode = (window as unknown as { __vscodeApi: { postMessage(message: Record<string, unknown>): void } }).__vscodeApi;
const NODE_LIMIT = 2400;
const EDGE_LIMIT = 7000;

function color(label: string): string {
    const value = label.toLowerCase();
    if (value.includes('function') || value.includes('method')) return '#65d1b5';
    if (value.includes('class') || value.includes('interface')) return '#bd93f9';
    if (value.includes('file') || value.includes('module')) return '#62a9ff';
    if (value.includes('variable') || value.includes('constant')) return '#f3c969';
    return '#91a4b7';
}

function hash(text: string): number {
    let output = 2166136261;
    for (let index = 0; index < text.length; index++) output = Math.imul(output ^ text.charCodeAt(index), 16777619);
    return output >>> 0;
}

function graphElements(snapshot?: Snapshot): { nodes: Node[]; edges: Edge[]; truncated: boolean } {
    if (!snapshot) return { nodes: [], edges: [], truncated: false };
    const rawNodes = snapshot.graph.nodes.slice(0, NODE_LIMIT);
    const included = new Set(rawNodes.map(node => node.id));
    const typeRows = new Map<string, number>();
    const nodes: Node[] = rawNodes.map((node, index) => {
        const type = node.label || 'Symbol';
        const row = typeRows.get(type) ?? 0;
        typeRows.set(type, row + 1);
        const seed = hash(node.id);
        const column = Array.from(typeRows.keys()).indexOf(type);
        return {
            id: node.id,
            position: {
                x: column * 330 + ((seed % 101) - 50),
                y: row * 82 + (((seed >>> 8) % 41) - 20),
            },
            data: { label: node.properties?.name || node.id, raw: node },
            style: {
                background: 'var(--vscode-editorWidget-background)',
                color: 'var(--vscode-editor-foreground)',
                border: `1px solid ${color(type)}`,
                borderLeft: `4px solid ${color(type)}`,
                borderRadius: 8,
                width: 190,
                fontSize: 11,
                padding: '8px 10px',
                boxShadow: '0 5px 18px rgba(0,0,0,.16)',
            },
        };
    });
    const edges: Edge[] = snapshot.graph.relationships
        .filter(edge => included.has(edge.sourceId) && included.has(edge.targetId))
        .slice(0, EDGE_LIMIT)
        .map(edge => ({
            id: edge.id,
            source: edge.sourceId,
            target: edge.targetId,
            label: edge.type,
            type: 'smoothstep',
            style: { stroke: 'var(--vscode-descriptionForeground)', opacity: 0.35 },
            labelStyle: { fontSize: 8, fill: 'var(--vscode-descriptionForeground)' },
        }));
    return { nodes, edges, truncated: snapshot.graph.nodes.length > NODE_LIMIT || snapshot.graph.relationships.length > EDGE_LIMIT };
}

function stringifyResults(value: unknown): string {
    if (!value) return 'No matches.';
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
}

function App(): React.ReactElement {
    const [status, setStatus] = useState<RuntimeStatus>({ running: false, managed: false, installing: false, port: 4747, message: 'Connecting…' });
    const [snapshot, setSnapshot] = useState<Snapshot>();
    const [selected, setSelected] = useState<GNode>();
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState('');
    const [tab, setTab] = useState<'details' | 'search' | 'insights'>('details');
    const elements = useMemo(() => graphElements(snapshot), [snapshot]);

    useEffect(() => {
        const listener = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'runtime') setStatus(message.status);
            if (message.type === 'snapshot') {
                setSnapshot(message.snapshot);
                setStatus(message.status);
                setBusy(false);
                setNotice('');
            }
            if (message.type === 'analysisProgress') {
                setBusy(true);
                const job = message.job ?? {};
                setNotice(String(job.progress?.message ?? job.progress?.phase ?? job.status ?? 'Analyzing…'));
            }
            if (message.type === 'searchResults') {
                setResults(stringifyResults(message.results));
                setBusy(false);
                setTab('search');
            }
            if (message.type === 'error') {
                setNotice(message.message);
                setBusy(false);
            }
        };
        window.addEventListener('message', listener);
        vscode.postMessage({ type: 'ready' });
        return () => window.removeEventListener('message', listener);
    }, []);

    const send = useCallback((type: string, extra: Record<string, unknown> = {}) => {
        setBusy(true);
        setNotice(type === 'analyze' ? 'Starting project analysis…' : 'Working…');
        vscode.postMessage({ type, ...extra });
    }, []);

    const runSearch = () => {
        if (!query.trim() || !snapshot?.repository) return;
        send('search', { query: query.trim(), repository: snapshot.repository });
    };

    const onNodeClick = (_: unknown, node: Node) => {
        setSelected(node.data.raw as GNode);
        setTab('details');
    };

    const onNodeDoubleClick = (_: unknown, node: Node) => {
        const raw = node.data.raw as GNode;
        if (raw.properties?.filePath) vscode.postMessage({ type: 'openFile', path: raw.properties.filePath, line: raw.properties.startLine });
    };

    const repoValue = snapshot?.repository ?? '';
    return <div className="shell">
        <header>
            <div className="brand"><span className="mark">GN</span><div><strong>GitNexus</strong><small>inside Ultraview</small></div></div>
            <div className={`status ${status.running ? 'online' : ''}`}><i />{status.installing ? 'Installing' : status.running ? `Local · ${status.port}` : 'Stopped'}</div>
            <select value={repoValue} onChange={event => send('selectRepository', { repository: event.target.value })} disabled={!snapshot?.repositories.length}>
                {!snapshot?.repositories.length && <option>No indexed repositories</option>}
                {snapshot?.repositories.map(repo => {
                    const value = repo.repoPath || repo.path || repo.name;
                    return <option value={value} key={value}>{repo.name}</option>;
                })}
            </select>
            <button className="primary" disabled={busy} onClick={() => send(status.running ? 'analyze' : 'start')}>{status.running ? 'Analyze workspace' : 'Start locally'}</button>
            <button disabled={busy} onClick={() => send('refresh', { repository: repoValue })}>Refresh</button>
            <button onClick={() => vscode.postMessage({ type: 'openCli' })}>CLI</button>
            <button onClick={() => vscode.postMessage({ type: 'startMcp' })}>MCP</button>
            <button title="Pull the latest clean upstream submodule" onClick={() => vscode.postMessage({ type: 'updateVendor' })}>Update</button>
        </header>

        <div className="body">
            <main>
                {!status.running && <div className="empty"><div className="orb">⌘</div><h2>Local code intelligence</h2><p>Start the GitNexus runtime bundled with Ultraview to explore symbols, dependencies, execution flows and impact—all on this machine.</p><button className="primary large" onClick={() => send('start')}>Start GitNexus</button><small>No separate GitNexus install required · Node.js 22.18+ or 24.11+</small></div>}
                {status.running && !snapshot?.graph.nodes.length && <div className="empty"><div className="orb">◎</div><h2>Index this workspace</h2><p>The local service is ready. Analyze the open folder to create its knowledge graph.</p><button className="primary large" onClick={() => send('analyze')}>Analyze workspace</button></div>}
                {status.running && Boolean(snapshot?.graph.nodes.length) && <ReactFlow nodes={elements.nodes} edges={elements.edges} onNodeClick={onNodeClick} onNodeDoubleClick={onNodeDoubleClick} fitView minZoom={0.05} maxZoom={2.5} nodesDraggable>
                    <Background gap={24} size={1} color="var(--vscode-editorIndentGuide-background)" />
                    <Controls position="bottom-left" />
                    <MiniMap position="bottom-right" nodeColor={node => String(node.style?.borderLeft ?? '#62a9ff').split(' ').pop() || '#62a9ff'} pannable zoomable />
                </ReactFlow>}
                <div className="hud"><b>{snapshot?.graph.nodes.length ?? 0}</b> symbols <span>·</span> <b>{snapshot?.graph.relationships.length ?? 0}</b> relationships {elements.truncated && <em>sampled for display</em>}</div>
                {(busy || notice) && <div className={`notice ${busy ? 'busy' : ''}`}>{busy && <i />}{notice}</div>}
            </main>

            <aside>
                <nav><button className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}>Details</button><button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>Search</button><button className={tab === 'insights' ? 'active' : ''} onClick={() => setTab('insights')}>Insights</button></nav>
                {tab === 'details' && <section>{selected ? <><span className="eyebrow">{selected.label}</span><h2>{selected.properties?.name || selected.id}</h2>{selected.properties?.filePath && <button className="file" onClick={() => vscode.postMessage({ type: 'openFile', path: selected.properties?.filePath, line: selected.properties?.startLine })}>{selected.properties.filePath}:{selected.properties.startLine ?? 1}</button>}<dl>{Object.entries(selected.properties ?? {}).filter(([key]) => !['name', 'filePath'].includes(key)).slice(0, 14).map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></React.Fragment>)}</dl></> : <div className="aside-empty">Select a symbol to inspect it.<br />Double-click to open source.</div>}</section>}
                {tab === 'search' && <section><h2>Semantic search</h2><div className="search"><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && runSearch()} placeholder="How does sync work?" /><button onClick={runSearch}>Search</button></div><pre>{results || 'Search the indexed graph using natural language or symbol names.'}</pre></section>}
                {tab === 'insights' && <section><h2>Repository insights</h2><div className="metric"><span>Clusters</span><strong>{snapshot?.clusters.length ?? 0}</strong></div><div className="metric"><span>Processes</span><strong>{snapshot?.processes.length ?? 0}</strong></div><div className="metric"><span>Runtime</span><strong>{status.version ? `v${status.version}` : '—'}</strong></div><p className="muted">GitNexus runs locally. Ultraview owns this panel; upstream engine updates do not overwrite its design.</p></section>}
            </aside>
        </div>
    </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
