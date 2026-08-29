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
 * Stability matters here: VS Code collapses/hides sidebar webviews as the
 * user navigates. When the panel is hidden the canvas is detached, which
 * can lose the WebGL context. We rebuild Sigma on visibility AND on data
 * change so the user never sees a permanently blank canvas.
 */

import { useEffect, useRef, useState } from 'react';
import Sigma from 'sigma';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { circular } from 'graphology-layout';
import type { GraphNode, KnowledgeGraph } from './state';
import { useAppState } from './state';

// Node palette — the original GitNexus `NODE_COLORS` map keyed by NodeLabel.
// Anything we don't recognise falls back to muted slate.
const NODE_COLORS: Record<string, string> = {
    Project: '#a855f7', Package: '#8b5cf6', Module: '#7c3aed',
    Folder: '#6366f1', File: '#3b82f6', Class: '#f59e0b',
    Function: '#10b981', Method: '#14b8a6', Variable: '#64748b',
    Interface: '#ec4899', Enum: '#f97316', Decorator: '#eab308',
    Import: '#475569', Type: '#a78bfa', CodeElement: '#64748b',
    Process: '#f43f5e', Section: '#60a5fa', Struct: '#f59e0b',
    Trait: '#ec4899', Impl: '#14b8a6', TypeAlias: '#a78bfa',
    Const: '#64748b', Static: '#64748b', Namespace: '#7c3aed',
    Union: '#f97316', Typedef: '#a78bfa', Macro: '#eab308',
    Property: '#64748b', Record: '#f59e0b', Delegate: '#14b8a6',
    Annotation: '#eab308', Constructor: '#10b981', Template: '#a78bfa',
    Route: '#f43f5e', Tool: '#a855f7', BasicBlock: '#475569',
};

const NODE_SIZES: Record<string, number> = {
    Project: 14, Package: 10, Module: 8, Folder: 7, File: 5,
    Class: 6, Function: 4, Method: 3, Variable: 2, Interface: 6,
    Enum: 4, Decorator: 2, Import: 1.5, Type: 3, CodeElement: 3,
    Process: 5, Section: 5, Struct: 6, Trait: 5, Impl: 4,
    TypeAlias: 4, Const: 2, Static: 2, Namespace: 7, Union: 4,
    Typedef: 4, Macro: 2, Property: 2, Record: 6, Delegate: 4,
    Annotation: 2, Constructor: 4, Template: 4, Route: 5,
    Tool: 5, BasicBlock: 3,
};

const colorFor = (label: string): string => NODE_COLORS[label] ?? '#64748b';
const sizeFor = (label: string): number => NODE_SIZES[label] ?? 3;

// Cap the visible graph so the WebGL renderer stays responsive on huge repos.
// We still report the real totals in the status bar.
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
            // Extra metadata we re-read on click.
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
            // duplicate that the multi check above missed
        }
    }

    return graph;
};

const runLayout = (graph: Graph): void => {
    if (graph.order === 0) return;
    // A circular initial layout keeps disconnected components from collapsing
    // on top of each other while ForceAtlas2 runs. Deterministic + cheap.
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

// Quick stable fingerprint of the underlying data. We rebuild Sigma only when
// the actual node/edge set changes — NOT when the parent state object
// reference changes (which happens on every message and would otherwise
// thrash the WebGL context).
const fingerprint = (kg: KnowledgeGraph | null): string => {
    if (!kg) return 'empty';
    return `${kg.nodes.length}:${kg.relationships.length}`;
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
    const builtGraphRef = useRef<Graph | null>(null);
    const builtFingerprintRef = useRef<string>('empty');
    const [error, setError] = useState<string | null>(null);

    // Build the graphology graph whenever the data fingerprint changes.
    // Storing the result in a ref (not state) means React doesn't re-render
    // every time the graph data settles — only the actual fingerprint change
    // triggers the heavy work.
    useEffect(() => {
        const fp = fingerprint(graph);
        if (fp === builtFingerprintRef.current) return;
        if (!graph || graph.nodes.length === 0) {
            builtGraphRef.current = null;
            builtFingerprintRef.current = fp;
            return;
        }
        const g = buildGraph(graph);
        runLayout(g);
        builtGraphRef.current = g;
        builtFingerprintRef.current = fp;
    }, [graph]);

    // Mount Sigma against the ref'd Graph. We tear down + re-mount when:
    //   1. The data fingerprint changes
    //   2. The component unmounts
    // This is the only place Sigma is created.
    useEffect(() => {
        const container = containerRef.current;
        const g = builtGraphRef.current;
        if (!container || !g || g.order === 0) return;

        setError(null);

        let renderer: Sigma | null = null;
        try {
            renderer = new Sigma(g, container, {
                renderEdgeLabels: false,
                defaultEdgeType: 'arrow',
                labelDensity: 0.7,
                labelGridCellSize: 80,
                labelRenderedSizeThreshold: 6,
                minCameraRatio: 0.05,
                maxCameraRatio: 8,
                // Pull label colors from the page foreground so they read in
                // any VS Code theme.
                labelColor: { color: 'var(--vscode-editor-foreground, #e5e7eb)' },
                edgeLabelColor: { color: 'var(--vscode-editor-foreground, #e5e7eb)' },
            });

            renderer.on('clickNode', ({ node, event }) => {
                try {
                    const filePath = g.getNodeAttribute(node, 'filePath') as string;
                    const startLine = (g.getNodeAttribute(node, 'startLine') as number | undefined) ?? 1;
                    const raw = g.getNodeAttribute(node, 'nodeType') as string;
                    const display = g.getNodeAttribute(node, 'label') as string;
                    const graphNode: GraphNode = {
                        id: node,
                        label: raw,
                        properties: { name: display ?? node, filePath, startLine },
                    };
                    setSelectedNode(graphNode);
                    setRightPanelTab('code');
                    onSelectNode?.(graphNode);
                    if (event.original?.detail === 2 && filePath) {
                        onOpenFile?.(filePath, startLine);
                    }
                } catch (err) {
                    console.warn('GraphCanvas click handler error:', err);
                }
            });

            renderer.on('clickStage', () => {
                setSelectedNode(null);
            });

            sigmaRef.current = renderer;
        } catch (err) {
            // WebGL may not be available in some webviews; surface a friendly
            // message instead of leaving a blank canvas.
            console.error('Sigma init failed:', err);
            setError(err instanceof Error ? err.message : String(err));
            return;
        }

        // Resize observer: when the panel is hidden + shown, the canvas
        // size may change. Sigma needs a refresh so it re-fits its viewport.
        const ro = new ResizeObserver(() => {
            try {
                renderer?.refresh();
            } catch (err) {
                console.warn('Sigma refresh error:', err);
            }
        });
        ro.observe(container);

        // WebGL context loss handler — recreate the renderer. Chromium drops
        // the context when the webview is hidden for a while or the GPU is
        // reset. Without this, the user sees a permanently blank canvas.
        const canvas = container.querySelector('canvas');
        const onContextLost = (event: Event) => {
            event.preventDefault();
            if (sigmaRef.current === renderer) {
                sigmaRef.current = null;
            }
            try {
                renderer?.kill();
            } catch {
                /* ignore */
            }
            // Re-mount on the next tick by forcing a state update.
            setTimeout(() => {
                if (container.isConnected && builtGraphRef.current) {
                    // The outer effect re-runs when builtFingerprintRef hasn't
                    // changed but we re-trigger by nulling it.
                    builtFingerprintRef.current = '';
                    setError(null);
                    // Force re-run via a no-op state nudge:
                    setHighlightedRefresh(prev => prev + 1);
                }
            }, 0);
        };
        canvas?.addEventListener('webglcontextlost', onContextLost);

        return () => {
            ro.disconnect();
            canvas?.removeEventListener('webglcontextlost', onContextLost);
            try {
                renderer?.kill();
            } catch {
                /* ignore */
            }
            if (sigmaRef.current === renderer) {
                sigmaRef.current = null;
            }
        };
        // We intentionally don't put setSelectedNode/setRightPanelTab/onSelectNode/onOpenFile
        // in the dep array — they're stable callbacks from the parent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [builtFingerprintRef.current, error]);

    // Bump counter to nudge a re-mount after a WebGL context loss.
    const [, setHighlightedRefresh] = useState(0);

    // Highlight a single node when a list/result row is hovered.
    useEffect(() => {
        const renderer = sigmaRef.current;
        if (!renderer) return;
        const g = renderer.getGraph();
        g.forEachNode((nodeId, attrs) => {
            const baseColor = attrs.color as string;
            const isMatch = highlightedNodeId && nodeId === highlightedNodeId;
            const tinted = isMatch ? '#fbbf24' : baseColor;
            g.setNodeAttribute(nodeId, 'color', tinted);
        });
        try {
            renderer.refresh();
        } catch (err) {
            console.warn('Sigma refresh error (highlight):', err);
        }
    }, [highlightedNodeId]);

    const isEmpty = !graph || graph.nodes.length === 0;

    if (error) {
        return (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
                <div className="max-w-[320px] text-center text-[12px]">
                    <div className="mb-2 text-2xl">⚠</div>
                    <p className="text-text-primary">Graph renderer failed to start</p>
                    <p className="mt-1 text-[10px] text-text-muted">{error}</p>
                    <p className="mt-2 text-[10px] text-text-muted">Reload the panel to retry. WebGL may be disabled in this VS Code window.</p>
                </div>
            </div>
        );
    }

    if (isEmpty) {
        return (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
                <div className="text-center">
                    <div className="mb-3 text-3xl">◇</div>
                    <p className="text-sm">No graph yet. Analyze a workspace to begin.</p>
                </div>
            </div>
        );
    }

    return <div ref={containerRef} className="h-full w-full" data-testid="sigma-canvas" />;
};
