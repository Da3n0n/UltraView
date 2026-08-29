/**
 * GitNexus webview entry point — replaces the ReactFlow prototype.
 *
 * Layout (mirrors the original `gitnexus-web` App.tsx, minus onboarding and
 * the AI agent):
 *
 *     ┌─────────────────────────────────────────────────────────┐
 *     │                       Header                            │
 *     ├─────────────────────────────────────────────────────────┤
 *     │                                                         │
 *     │                       GraphCanvas (Sigma.js)            │
 *     │                                                         │
 *     ├──────────────────────────────┬──────────────────────────┤
 *     │   main — file tree / empty   │       RightPanel         │
 *     ├──────────────────────────────┴──────────────────────────┤
 *     │                       StatusBar                         │
 *     └─────────────────────────────────────────────────────────┘
 *
 * The local file tree is left out for now — VS Code already has one open in
 * the explorer, and the repo's symbol→file lookup happens through the
 * right panel. Bringing in the original `FileTreePanel` would mean bundling
 * a tree component plus a file-system API; defer until the layout is
 * otherwise solid.
 */

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppStateProvider, useAppState } from './gitNexus/state';
import { GraphCanvas } from './gitNexus/GraphCanvas';
import { Header } from './gitNexus/Header';
import { StatusBar } from './gitNexus/StatusBar';
import { RightPanel } from './gitNexus/RightPanel';
import './gitNexus/theme.css';

const EmptyState = (): React.ReactElement => {
    const { status, postMessage, isAnalyzing } = useAppState();
    const startable = !status.running && !status.installing;
    return (
        <div className="flex h-full w-full items-center justify-center">
            <div className="max-w-[360px] text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-node-interface text-[20px] font-bold text-white shadow-glow">◇</div>
                <h2 className="mb-1 text-[16px] font-semibold text-text-primary">Local code intelligence</h2>
                <p className="mb-4 text-[12px] text-text-muted">
                    {startable
                        ? 'Start the GitNexus runtime bundled with Ultraview to explore symbols, dependencies and execution flows — all on this machine.'
                        : status.installing
                            ? 'Installing the GitNexus runtime…'
                            : 'Indexing your workspace…'}
                </p>
                <button
                    onClick={() => postMessage({ type: 'start' })}
                    disabled={!startable || isAnalyzing}
                    className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-accent to-node-interface px-4 py-1.5 text-[12px] font-semibold text-white shadow-glow disabled:opacity-50"
                >
                    {status.installing ? 'Installing…' : status.running ? 'Analyze workspace' : 'Start GitNexus'}
                </button>
                <p className="text-[10px] text-text-muted">GitNexus and its runtime are included — no separate installation.</p>
            </div>
        </div>
    );
};

const AnalyzingState = (): React.ReactElement => {
    const { progress, isAnalyzing, graph } = useAppState();
    const showGraph = !isAnalyzing && (graph?.nodes.length ?? 0) > 0;
    if (!showGraph && isAnalyzing) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                <div className="h-1 w-64 overflow-hidden rounded-full bg-elevated">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-node-interface transition-all duration-300"
                        style={{ width: `${progress?.percent ?? 0}%` }}
                    />
                </div>
                <p className="text-[12px] text-text-muted">{progress?.message ?? progress?.status ?? 'Analyzing…'}</p>
            </div>
        );
    }
    return <></>;
};

const Shell = (): React.ReactElement => {
    const { status, graph, postMessage, setSelectedNode, setRightPanelTab } = useAppState();
    const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

    const showEmpty = !status.running && (graph?.nodes.length ?? 0) === 0;
    const showAnalyzing = status.running && (graph?.nodes.length ?? 0) === 0;

    const handleOpenFile = (path: string, line: number) => {
        postMessage({ type: 'openFile', path, line });
    };

    const handleSelectFromHeader = (nodeId: string) => {
        if (!graph) return;
        const node = graph.nodes.find(n => n.id === nodeId);
        if (node) {
            setSelectedNode(node);
            setRightPanelTab('code');
            setHighlightedNodeId(nodeId);
            setTimeout(() => setHighlightedNodeId(null), 1500);
        }
    };

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-void text-text-primary">
            <Header onSelectFromSearch={handleSelectFromHeader} />
            <main className="flex min-h-0 flex-1">
                <div className="relative min-w-0 flex-1">
                    {/* GraphCanvas always renders its container; it shows
                        placeholders for empty/error states internally so
                        the canvas element is never unmounted by a parent
                        conditional. */}
                    {showEmpty ? (
                        <EmptyState />
                    ) : (
                        <GraphCanvas
                            highlightedNodeId={highlightedNodeId}
                            onOpenFile={handleOpenFile}
                            onSelectNode={node => {
                                setSelectedNode(node);
                                setRightPanelTab('code');
                            }}
                        />
                    )}
                </div>
                <RightPanel />
            </main>
            <StatusBar />
        </div>
    );
};

const App = (): React.ReactElement => (
    <AppStateProvider>
        <Shell />
    </AppStateProvider>
);

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(<App />);
}

export default App;
