/**
 * Status bar — adapted from the original `StatusBar.tsx`. Drops the sponsor
 * banner and progress phases that depend on the LangChain agent; keeps the
 * left-side status indicator, the node/edge counters, and the primary
 * language chip.
 */

import { useMemo } from 'react';
import { useAppState } from './state';

export const StatusBar = (): React.ReactElement => {
    const { graph, status, progress, isAnalyzing, currentRepo, availableRepos } = useAppState();

    const nodeCount = graph?.nodes.length ?? 0;
    const edgeCount = graph?.relationships.length ?? 0;

    const primaryLanguage = useMemo(() => {
        if (!graph) return null;
        const counts: Record<string, number> = {};
        for (const node of graph.nodes) {
            const lang = node.properties?.language;
            if (typeof lang === 'string' && lang) {
                counts[lang] = (counts[lang] ?? 0) + 1;
            }
        }
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return entries[0]?.[0] ?? null;
    }, [graph]);

    const ready = status.running && !isAnalyzing;
    const indicator = isAnalyzing
        ? { dot: 'bg-yellow-400', label: progress?.message ?? progress?.status ?? 'Analyzing…' }
        : progress?.phase === 'error'
            ? { dot: 'bg-red-400', label: progress.error ?? 'Error' }
            : status.running
                ? { dot: 'bg-node-function', label: `Local · ${status.port}` }
                : status.installing
                    ? { dot: 'bg-yellow-400', label: 'Installing runtime…' }
                    : { dot: 'bg-gray-500', label: status.message || 'Stopped' };

    return (
        <footer className="flex items-center justify-between border-t border-dashed border-border-subtle bg-deep px-3 py-1.5 text-[10px] text-text-muted">
            <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${indicator.dot}`} />
                <span>{indicator.label}</span>
            </div>
            <div className="flex items-center gap-2">
                {ready && graph && (
                    <>
                        <span><strong className="text-text-primary">{nodeCount}</strong> nodes</span>
                        <span>·</span>
                        <span><strong className="text-text-primary">{edgeCount}</strong> edges</span>
                        {primaryLanguage && (
                            <>
                                <span>·</span>
                                <span className="text-text-secondary">{primaryLanguage}</span>
                            </>
                        )}
                    </>
                )}
                {currentRepo && availableRepos.length > 1 && (() => {
                    const repo = availableRepos.find(r => (r.repoPath || r.path || r.name) === currentRepo);
                    return repo ? <span className="text-text-muted">· {repo.name}</span> : null;
                })()}
            </div>
        </footer>
    );
};
