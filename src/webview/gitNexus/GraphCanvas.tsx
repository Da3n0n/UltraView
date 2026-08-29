/**
 * Sigma.js-based graph canvas.
 *
 * Faithful to the original GitNexus web's `GraphCanvas.tsx` but stripped of
 * the parts that don't apply in a webview (chat-only overlays, AI
 * highlights, blast radius, animated nodes, etc.). The graph is rendered
 * with WebGL via Sigma, the layout runs once with ForceAtlas2, and node
 * clicks propagate to the parent which forwards them to the VS Code
 * extension as `openFile` messages.
 *
 * Why a fresh file instead of vendoring the original? The original pulls
 * LangChain, the i18n stack, the AppStateProvider, and several hooks that
 * each have their own backend-client. Inlining a self-contained renderer
 * here keeps the bundle small and the dependency surface narrow.
 */

import { useEffect, useMemo, useRef } from 'react';
import Sigma from 'sigma';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { circular } from 'graphology-layout';
import type { GraphNode, KnowledgeGraph } from './state';
import { useAppState } from './state';

// Node palette — the original GitNexus `NODE_COLORS` map keyed by NodeLabel.
// Mapped to a flat set of common labels so we don't need to import
// `gitnexus-shared` types here. Anything we don't recognise falls back to
// the muted slate.
const NODE_COLORS: Record<string, string> = {
    Project: '#a855f7',
    Package: '#8b5cf6',
    Module: '#7c3aed',
    Folder: '#6366f1',
    File: '#3b82f6',
    Class: '#f59e0b',
    Function: '#10b981',
    Method: '#14b8a6',
    Variable: '#64748b',
    Interface: '#ec4899',
    Enum: '#f97316',
    Decorator: '#eab308',
    Import: '#475569',
    Type: '#a78bfa',
    CodeElement: '#64748b',
    Process: '#f43f5e',
    Section: '#60a5fa',
    Struct: '#f59e0b',
    Trait: '#ec4899',
    Impl: '#14b8a6',
    TypeAlias: '#a78bfa',
    Const: '#64748b',
    Static: '#64748b',
    Namespace: '#7c3aed',
    Union: '#f97316',
    Typedef: '#a78bfa',
    Macro: '#eab308',
    Property: '#64748b',
    Record: '#f59e0b',
    Delegate: '#14b8a6',
    Annotation: '#eab308',
    Constructor: '#10b981',
    Template: '#a78bfa',
    Route: '#f43f5e',
    Tool: '#a855f7',
    BasicBlock: '#475569',
};

const NODE_SIZES: Record<string, number> = {
    Project: 14,
    Package: 10,
    Module: 8,
    Folder: 7,
    File: 5,
    Class: 6,
    Function: 4,
    Method: 3,
    Variable: 2,
    Interface: 6,
    Enum: 4,
    Decorator: 2,
    Import: 1.5,
    Type: 3,
    CodeElement: 3,
    Process: 5,
    Section: 5,
    Struct: 6,
    Trait: 5,
    Impl: 4,
    TypeAlias: 4,
    Const: 2,
    Static: 2,
    Namespace: 7,
    Union: 4,
    Typedef: 4,
    Macro: 2,
    Property: 2,
    Record: 6,
    Delegate: 4,
    Annotation: 2,
    Constructor: 4,
    Template: 4,
    Route: 5,
    Tool: 5,
    BasicBlock: 3,
};

const colorFor = (label: string): string => NODE_COLORS[label] ?? '#64748b';
const sizeFor = (label: string): number => NODE_SIZES[label] ?? 3;

// Cap the visible graph at sane limits so the WebGL renderer doesn't choke
// on huge repos. Beyond this we still keep the totals in the status bar.
const NODE_LIMIT = 1800;
const EDGE_LIMIT = 5000;

const buildGraph = (kg: KnowledgeGraph): Graph => {
    const graph = new Graph({ multi: true, type: 'directed' });
    const nodeCap = kg.nodes.slice(0, NODE_LIMIT);
    const included = new Set(nodeCap.map(node => node.id));

    for (const node of nodeCap) {
        const label = node.label || 'Symbol';
        graph.addNode(node.id, {
            label: node.properties?.name || node.id,
            color: colorFor(label),
            size: sizeFor(label),
            // Hover label is set per-node; Sigma's `label` attr is the visible text.
            nodeType: label,
            filePath: node.properties?.filePath ?? '',
            startLine: node.properties?.startLine,
        });
    }

    let edgeCount = 0;
    for (const rel of kg.relationships) {
        if (edgeCount >= EDGE_LIMIT) break;
        if (!included.has(rel.sourceId) || !included.has(rel.targetId)) continue;
        if (!graph.hasNode(rel.sourceId) || !graph.hasNode(rel.targetId)) continue;
        if (rel.sourceId === rel.targetId) continue;
        if (graph.hasEdge(rel.sourceId, rel.targetId)) continue;
        try {
            graph.addDirectedEdgeWithKey(rel.id, rel.sourceId, rel.targetId, {
                size: 1,
                color: '#4b5563',
                type: rel.type,
            });
            edgeCount += 1;
        } catch {
            // skip duplicates that the multi check above missed
        }
    }

    return graph;
};

const runLayout = (graph: Graph): void => {
    if (graph.order === 0) return;
    // A circular initial layout keeps disconnected components from collapsing
    // on top of each other while ForceAtlas2 runs. It's deterministic and
    // cheap.
    circular.assign(graph);
    const settings = forceAtlas2.inferSettings(graph);
    forceAtlas2.assign(graph, {
        iterations: Math.min(150, Math.max(50, Math.round(Math.log2(graph.order + 1) * 30))),
        settings: {
            ...settings,
            gravity: 1,
            scalingRatio: 10,
            slowDown: 5,
            strongGravityMode: false,
        },
    });
};

export interface GraphCanvasProps {
    onSelectNode?: (node: GraphNode) => void;
    onOpenFile?: (path: string, line: number) => void;
    highlightedNodeId?: string | null;
}

export const GraphCanvas = ({ onSelectNode, onOpenFile, highlightedNodeId }: GraphCanvasProps): React.ReactElement => {
    const { graph, setSelectedNode, setRightPanelTab } = useAppState();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const sigmaRef = useRef<Sigma | null>(null);
    const builtKeyRef = useRef<string>('');

    const built = useMemo(() => {
        if (!graph) return null;
        const g = buildGraph(graph);
        runLayout(g);
        return g;
    }, [graph]);

    // Mount Sigma once and re-feed it when the graph changes. We tear down
    // between graphs to keep WebGL state clean.
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !built) return;
        const fingerprint = `${built.order}-${built.size}`;
        if (builtKeyRef.current === fingerprint && sigmaRef.current) return;

        if (sigmaRef.current) {
            sigmaRef.current.kill();
            sigmaRef.current = null;
        }
        builtKeyRef.current = fingerprint;

        const renderer = new Sigma(built, container, {
            renderEdgeLabels: false,
            defaultEdgeType: 'arrow',
            labelDensity: 0.7,
            labelGridCellSize: 80,
            labelRenderedSizeThreshold: 6,
            minCameraRatio: 0.05,
            maxCameraRatio: 8,
            // Pull label colors from the page foreground; Sigma's default is
            // its own dark color which clashes with VS Code themes.
            labelColor: { color: 'var(--vscode-editor-foreground, #e5e7eb)' },
            edgeLabelColor: { color: 'var(--vscode-editor-foreground, #e5e7eb)' },
        });

        renderer.on('clickNode', ({ node, event }) => {
            const raw = built.getNodeAttribute(node, 'nodeType') as string;
            const filePath = built.getNodeAttribute(node, 'filePath') as string;
            const startLine = (built.getNodeAttribute(node, 'startLine') as number | undefined) ?? 1;
            const graphNode: GraphNode = {
                id: node,
                label: raw,
                properties: {
                    name: built.getNodeAttribute(node, 'label') as string ?? node,
                    filePath,
                    startLine,
                },
            };
            setSelectedNode(graphNode);
            setRightPanelTab('code');
            onSelectNode?.(graphNode);
            if (event.original?.detail === 2 && filePath) {
                onOpenFile?.(filePath, startLine);
            }
        });

        renderer.on('clickStage', () => {
            setSelectedNode(null);
        });

        sigmaRef.current = renderer;
        return () => {
            renderer.kill();
            sigmaRef.current = null;
        };
    }, [built, setSelectedNode, setRightPanelTab, onSelectNode, onOpenFile]);

    // Highlight a single node when a list/result row is hovered. Sigma's
    // public API doesn't expose a highlighter from the renderer, so we mutate
    // the underlying graphology graph and ask Sigma to refresh.
    useEffect(() => {
        const renderer = sigmaRef.current;
        if (!renderer) return;
        const graphologyGraph = renderer.getGraph();
        graphologyGraph.forEachNode((nodeId, attrs) => {
            const baseColor = attrs.color as string;
            const isMatch = highlightedNodeId && nodeId === highlightedNodeId;
            const tinted = isMatch ? '#fbbf24' : baseColor;
            graphologyGraph.setNodeAttribute(nodeId, 'color', tinted);
        });
        renderer.refresh();
    }, [highlightedNodeId, built]);

    if (!built || built.order === 0) {
        return <div className="flex h-full w-full items-center justify-center text-text-muted">
            <div className="text-center">
                <div className="mb-3 text-3xl">◇</div>
                <p className="text-sm">No graph yet. Analyze a workspace to begin.</p>
            </div>
        </div>;
    }

    return <div ref={containerRef} className="h-full w-full" data-testid="sigma-canvas" />;
};
