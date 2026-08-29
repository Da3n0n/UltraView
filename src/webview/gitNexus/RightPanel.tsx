/**
 * Right panel — adapted from `RightPanel.tsx` in gitnexus-web.
 *
 * The original is a tabbed Code + Chat surface. The chat tab is driven by
 * the LangChain ReAct agent which we don't bundle here, so it becomes a
 * Read-only "Search" tab (semantic search results from the runtime) plus a
 * "Processes" tab (the existing pre-computed execution flows) plus the
 * "Code" tab (selected node details).
 */

import { useState } from 'react';
import { Search, FileCode2, GitBranch, X, ArrowRight } from 'lucide-react';
import { useAppState } from './state';

interface Property {
    key: string;
    value: string;
}

const renderProperties = (properties: Record<string, unknown> | undefined): Property[] => {
    if (!properties) return [];
    return Object.entries(properties)
        .filter(([key]) => !['name', 'filePath', 'startLine', 'endLine', 'language'].includes(key))
        .slice(0, 12)
        .map(([key, value]) => ({
            key,
            value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''),
        }));
};

export const RightPanel = (): React.ReactElement => {
    const {
        graph,
        selectedNode,
        setSelectedNode,
        isRightPanelOpen,
        setRightPanelOpen,
        rightPanelTab,
        setRightPanelTab,
        searchResults,
        isSearching,
        currentRepo,
        setSearchResults,
        setIsSearching,
        postMessage,
    } = useAppState();

    const [query, setQuery] = useState('');

    if (!isRightPanelOpen) {
        return (
            <aside className="flex w-9 flex-col items-center border-l border-border-subtle bg-deep py-2">
                <button
                    onClick={() => setRightPanelOpen(true)}
                    className="rounded-md p-1.5 text-text-muted hover:bg-elevated hover:text-text-primary"
                    title="Open panel"
                >
                    <ArrowRight size={14} />
                </button>
            </aside>
        );
    }

    const runSearch = () => {
        if (!query.trim() || !currentRepo) return;
        setIsSearching(true);
        postMessage({ type: 'search', query: query.trim(), repository: currentRepo });
    };

    const processCount = graph?.processes?.length ?? 0;
    const clusterCount = graph?.clusters?.length ?? 0;
    const properties = renderProperties(selectedNode?.properties);

    return (
        <aside className="flex w-[300px] min-w-[260px] flex-col border-l border-border-subtle bg-deep">
            <div className="flex items-center justify-between border-b border-border-subtle px-2 py-1.5">
                <nav className="flex items-center gap-1">
                    <button
                        onClick={() => setRightPanelTab('code')}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${rightPanelTab === 'code' ? 'bg-elevated text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        <FileCode2 size={11} /> Code
                    </button>
                    <button
                        onClick={() => setRightPanelTab('search')}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${rightPanelTab === 'search' ? 'bg-elevated text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        <Search size={11} /> Search
                    </button>
                    <button
                        onClick={() => setRightPanelTab('processes')}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${rightPanelTab === 'processes' ? 'bg-elevated text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        <GitBranch size={11} /> Processes
                    </button>
                </nav>
                <button
                    onClick={() => setRightPanelOpen(false)}
                    className="rounded-md p-1 text-text-muted hover:bg-elevated hover:text-text-primary"
                    title="Hide panel"
                >
                    <X size={12} />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                {rightPanelTab === 'code' && (
                    selectedNode ? (
                        <div className="px-3 py-3">
                            <div className="mb-1 text-[10px] uppercase tracking-wider text-text-muted">{selectedNode.label.toLowerCase()}</div>
                            <h2 className="mb-2 break-all text-[14px] font-semibold text-text-primary">
                                {selectedNode.properties?.name ?? selectedNode.id}
                            </h2>
                            {selectedNode.properties?.filePath && (
                                <button
                                    onClick={() => postMessage({
                                        type: 'openFile',
                                        path: String(selectedNode.properties?.filePath),
                                        line: Number(selectedNode.properties?.startLine ?? 1),
                                    })}
                                    className="mb-3 inline-flex max-w-full items-center gap-1 rounded-md border border-border-subtle bg-elevated px-2 py-1 text-[11px] text-text-secondary hover:border-border-default hover:text-text-primary"
                                >
                                    <FileCode2 size={11} className="shrink-0" />
                                    <span className="truncate">{String(selectedNode.properties.filePath)}:{Number(selectedNode.properties.startLine ?? 1)}</span>
                                </button>
                            )}
                            {properties.length === 0 ? (
                                <p className="text-[11px] text-text-muted">No additional properties.</p>
                            ) : (
                                <dl className="space-y-1.5">
                                    {properties.map(prop => (
                                        <div key={prop.key} className="grid grid-cols-[80px_1fr] gap-2 text-[11px]">
                                            <dt className="truncate text-text-muted">{prop.key}</dt>
                                            <dd className="break-all text-text-primary">{prop.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                        </div>
                    ) : (
                        <div className="px-3 py-6 text-center text-[12px] text-text-muted">
                            <p>Select a node to inspect it.</p>
                            <p className="mt-1 text-[10px]">Double-click to open the source file.</p>
                        </div>
                    )
                )}

                {rightPanelTab === 'search' && (
                    <div className="flex h-full flex-col">
                        <div className="flex gap-1.5 border-b border-border-subtle p-2">
                            <input
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                onKeyDown={event => event.key === 'Enter' && runSearch()}
                                placeholder="How does sync work?"
                                className="min-w-0 flex-1 rounded-md border border-border-subtle bg-elevated px-2 py-1 text-[11px] text-text-primary outline-none placeholder:text-text-muted"
                            />
                            <button
                                onClick={runSearch}
                                disabled={!query.trim() || isSearching}
                                className="rounded-md bg-gradient-to-br from-accent to-node-interface px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                            >
                                {isSearching ? '…' : 'Search'}
                            </button>
                        </div>
                        <pre className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 text-[11px] text-text-secondary">
                            {searchResults || (isSearching ? 'Searching…' : 'Search the indexed graph using natural language or symbol names.')}
                        </pre>
                    </div>
                )}

                {rightPanelTab === 'processes' && (
                    <div className="space-y-3 p-3 text-[12px]">
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-text-muted">Clusters</div>
                            <div className="text-[18px] font-semibold text-text-primary">{clusterCount}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-text-muted">Execution flows</div>
                            <div className="text-[18px] font-semibold text-text-primary">{processCount}</div>
                        </div>
                        <p className="text-[10px] text-text-muted">
                            The runtime computes pre-aggregated clusters and execution flows so the panel can surface them without re-running
                            analysis. Open the standalone GitNexus web for full process visualisation.
                        </p>
                    </div>
                )}
            </div>
        </aside>
    );
};
