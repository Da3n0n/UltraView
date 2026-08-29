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
 * Stability rules this component follows strictly:
 *   1. The outer container div is ALWAYS rendered with the same ref —
 *      empty / error placeholders render INSIDE it, so the canvas
 *      element is never unmounted by a parent conditional.
 *   2. Mount Sigma with useLayoutEffect so the canvas is created AFTER
 *      the browser has computed layout. WebGL renderers need a non-zero
 *      container size on first paint or the drawing buffer stays 0x0.
 *   3. The mount effect's dep array is [mountFingerprint, remountTick]
 *      only — props and other state are captured via refs so the effect
 *      doesn't re-run on re-render. State changes never recreate Sigma.
 *   4. WebGL context loss is detected, the dead renderer is killed, and
 *      a remount is scheduled via remountTick. ResizeObserver ignores
 *      0x0 sizes that happen during sidebar collapse.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
    // Stash the latest click handlers in refs so the mount-once effect
    // doesn't need them in its dep array (which would re-run it).
    const onSelectNodeRef = useRef(onSelectNode);
    const onOpenFileRef = useRef(onOpenFile);
    const setSelectedNodeRef = useRef(setSelectedNode);
    const setRightPanelTabRef = useRef(setRightPanelTab);
    onSelectNodeRef.current = onSelectNode;
    onOpenFileRef.current = onOpenFile;
    setSelectedNodeRef.current = setSelectedNode;
    setRightPanelTabRef.current = setRightPanelTab;

    const [error, setError] = useState<string | null>(null);
    // The fingerprint of the data we last mounted Sigma against.
    const [mountFingerprint, setMountFingerprint] = useState<string>('empty');
    // Bumped to force a re-mount after WebGL context loss or 0x0 retry.
    const [remountTick, setRemountTick] = useState(0);

    useEffect(() => {
        setMountFingerprint(fingerprint(graph));
    }, [graph]);

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        if (!graph || graph.nodes.length === 0) return;

        // Reject 0x0 containers — sidebar panels sometimes start that way.
        // Defer with rAF and bump remountTick so this effect re-runs once
        // the layout is settled.
        const rect = container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            const id = requestAnimationFrame(() => {
                setRemountTick(value => value + 1);
            });
            return () => cancelAnimationFrame(id);
        }

        const g = buildGraph(graph);
        runLayout(g);

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
                    setSelectedNodeRef.current?.(graphNode);
                    setRightPanelTabRef.current?.('code');
                    onSelectNodeRef.current?.(graphNode);
                    if (event.original?.detail === 2 && filePath) {
                        onOpenFileRef.current?.(filePath, startLine);
                    }
                } catch (err) {
                    console.warn('GraphCanvas click handler error:', err);
                }
            });

            renderer.on('clickStage', () => {
                setSelectedNodeRef.current?.(null);
            });

            sigmaRef.current = renderer;
        } catch (err) {
            console.error('Sigma init failed:', err);
            setError(err instanceof Error ? err.message : String(err));
            return;
        }

        // Resize observer: skip 0x0 sizes, dedupe to one refresh per frame.
        let rafId: number | null = null;
        const scheduleRefresh = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                try {
                    renderer?.refresh();
                } catch (err) {
                    console.warn('Sigma refresh error:', err);
                }
            });
        };
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width < 1 || height < 1) continue;
            }
            scheduleRefresh();
        });
        ro.observe(container);

        // WebGL context loss — kill the dead renderer and bump the
        // remount counter so this effect runs again with a fresh context.
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
            setRemountTick(value => value + 1);
        };
        canvas?.addEventListener('webglcontextlost', onContextLost);

        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mountFingerprint, remountTick]);

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

    return (
        <div ref={containerRef} className="relative h-full w-full" data-testid="sigma-canvas">
            {/* Sigma mounts directly into this div. The placeholder overlays
                sit above the canvas so the container never unmounts. */}
            {error && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-void/80 text-text-muted">
                    <div className="max-w-[320px] text-center text-[12px]">
                        <div className="mb-2 text-2xl">⚠</div>
                        <p className="text-text-primary">Graph renderer failed to start</p>
                        <p className="mt-1 text-[10px] text-text-muted">{error}</p>
                        <p className="mt-2 text-[10px] text-text-muted">Reload the panel to retry. WebGL may be disabled in this VS Code window.</p>
                    </div>
                </div>
            )}
            {isEmpty && !error && (
                <div className="absolute inset-0 z-10 flex items-center justify-center text-text-muted">
                    <div className="text-center">
                        <div className="mb-3 text-3xl">◇</div>
                        <p className="text-sm">No graph yet. Analyze a workspace to begin.</p>
                    </div>
                </div>
            )}
        </div>
    );
};
