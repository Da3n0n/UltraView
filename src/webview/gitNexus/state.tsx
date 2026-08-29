/**
 * Adapted useAppState hook for the embedded GitNexus webview.
 *
 * Mirrors a slim subset of the original `useAppState.tsx` shape (graph data,
 * selection, repo list, right-panel open state) but reads its data from the
 * VS Code webview message protocol instead of an HTTP backend-client.
 *
 * The original hook depends on LangChain agent state, the i18n stack, the
 * Sigma.js settings store, and a bunch of process-flow machinery. We
 * intentionally drop those — they are not relevant to an embedded panel
 * where the runtime is already running and the workspace is already open.
 */

import {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    useMemo,
    ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Domain types — kept loose on purpose. The webview gets serialised data from
// the extension and only needs to read it. We don't model optional properties
// the original does because the embedded UI doesn't use them.
// ---------------------------------------------------------------------------

export interface KnowledgeGraph {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
    clusters?: unknown[];
    processes?: unknown[];
}

export interface GraphNode {
    id: string;
    label: string;
    properties?: {
        name?: string;
        filePath?: string;
        startLine?: number;
        endLine?: number;
        language?: string;
        [key: string]: unknown;
    };
}

export interface GraphRelationship {
    id: string;
    sourceId: string;
    targetId: string;
    type: string;
}

export interface BackendRepo {
    name: string;
    path?: string;
    repoPath?: string;
    stats?: Record<string, number>;
}

export interface RuntimeStatus {
    running: boolean;
    managed: boolean;
    installing: boolean;
    port: number;
    version?: string;
    nodeVersion?: string;
    message: string;
}

export interface AnalysisProgress {
    phase?: string;
    percent?: number;
    status?: string;
    message?: string;
    error?: string;
}

export type RightPanelTab = 'code' | 'search' | 'processes';

export interface AppState {
    // Graph data
    graph: KnowledgeGraph | null;
    setGraph: (graph: KnowledgeGraph | null) => void;

    // Repo identity
    currentRepo: string | null;
    setCurrentRepo: (id: string | null) => void;
    availableRepos: BackendRepo[];

    // Selection
    selectedNode: GraphNode | null;
    setSelectedNode: (node: GraphNode | null) => void;

    // Right panel
    isRightPanelOpen: boolean;
    setRightPanelOpen: (open: boolean) => void;
    rightPanelTab: RightPanelTab;
    setRightPanelTab: (tab: RightPanelTab) => void;

    // Runtime status
    status: RuntimeStatus;

    // Analysis
    progress: AnalysisProgress | null;
    isAnalyzing: boolean;

    // Search results
    searchResults: string;
    setSearchResults: (results: string) => void;
    lastSearchQuery: string;
    setLastSearchQuery: (query: string) => void;
    isSearching: boolean;
    setIsSearching: (busy: boolean) => void;

    // VS Code bridge
    postMessage: (message: Record<string, unknown>) => void;
}

const AppStateContext = createContext<AppState | null>(null);

const initialStatus: RuntimeStatus = {
    running: false,
    managed: false,
    installing: false,
    port: 4747,
    message: 'Connecting…',
};

const initialGraph: KnowledgeGraph = {
    nodes: [],
    relationships: [],
    clusters: [],
    processes: [],
};

interface InboundMessage {
    type: string;
    status?: RuntimeStatus;
    snapshot?: { repository?: string; repositories?: BackendRepo[]; graph: KnowledgeGraph; clusters?: unknown[]; processes?: unknown[] };
    job?: AnalysisProgress;
    results?: unknown;
    message?: string;
}

// `window.__vscodeApi` is set by the inline script in `gitNexusProvider.ts`
// and declared globally by `src/webview/codeFlowApp.tsx` (`VsCodeApi`).
// We access it through that interface; no extra `declare global` needed here.
const getVscode = (): { postMessage(message: Record<string, unknown>): void } | null => {
    return (window as unknown as { __vscodeApi?: { postMessage(message: Record<string, unknown>): void } }).__vscodeApi ?? null;
};

export const AppStateProvider = ({ children }: { children: ReactNode }): React.ReactElement => {
    const vscode = getVscode();

    const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
    const [currentRepo, setCurrentRepo] = useState<string | null>(null);
    const [availableRepos, setAvailableRepos] = useState<BackendRepo[]>([]);
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
    const [isRightPanelOpen, setRightPanelOpen] = useState(true);
    const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('code');
    const [status, setStatus] = useState<RuntimeStatus>(initialStatus);
    const [progress, setProgress] = useState<AnalysisProgress | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [searchResults, setSearchResults] = useState('');
    const [lastSearchQuery, setLastSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    // Bridge: receive messages from the extension.
    useEffect(() => {
        if (!vscode) return;
        const listener = (event: MessageEvent) => {
            const message = event.data as InboundMessage;
            switch (message.type) {
                case 'runtime':
                    if (message.status) setStatus(message.status);
                    break;
                case 'snapshot':
                    if (message.snapshot) {
                        setCurrentRepo(message.snapshot.repository ?? null);
                        setAvailableRepos(message.snapshot.repositories ?? []);
                        setGraph({
                            nodes: message.snapshot.graph.nodes,
                            relationships: message.snapshot.graph.relationships,
                            clusters: message.snapshot.clusters ?? [],
                            processes: message.snapshot.processes ?? [],
                        });
                        if (message.status) setStatus(message.status);
                        setIsAnalyzing(false);
                        setProgress(null);
                    }
                    break;
                case 'analysisProgress':
                    setIsAnalyzing(true);
                    setProgress(message.job ?? null);
                    break;
                case 'searchResults':
                    setSearchResults(typeof message.results === 'string' ? message.results : JSON.stringify(message.results, null, 2));
                    setIsSearching(false);
                    setRightPanelTab('search');
                    break;
                case 'error':
                    setProgress({ phase: 'error', error: message.message });
                    setIsAnalyzing(false);
                    setIsSearching(false);
                    break;
            }
        };
        window.addEventListener('message', listener);
        vscode.postMessage({ type: 'ready' });
        return () => window.removeEventListener('message', listener);
    }, [vscode]);

    const postMessage = useCallback((message: Record<string, unknown>) => {
        vscode?.postMessage(message);
    }, [vscode]);

    const value = useMemo<AppState>(() => ({
        graph,
        setGraph,
        currentRepo,
        setCurrentRepo,
        availableRepos,
        selectedNode,
        setSelectedNode,
        isRightPanelOpen,
        setRightPanelOpen,
        rightPanelTab,
        setRightPanelTab,
        status,
        progress,
        isAnalyzing,
        searchResults,
        setSearchResults,
        lastSearchQuery,
        setLastSearchQuery,
        isSearching,
        setIsSearching,
        postMessage,
    }), [
        graph, currentRepo, availableRepos, selectedNode,
        isRightPanelOpen, rightPanelTab, status, progress, isAnalyzing,
        searchResults, lastSearchQuery, isSearching, postMessage,
    ]);

    return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = (): AppState => {
    const ctx = useContext(AppStateContext);
    if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
    return ctx;
};

// Re-export with a default graph so the UI can render an empty placeholder
// before the first snapshot arrives.
export { initialGraph };
