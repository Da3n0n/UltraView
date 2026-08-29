/**
 * Header bar — adapted from the original `Header.tsx` in gitnexus-web.
 *
 * Strips the parts that don't fit an embedded webview (Cmd+K search across
 * the whole graph, language switcher, sponsor banner, the GitHub OAuth flow,
 * RepoAnalyzer drop-zone, EmbeddingStatus). Keeps the parts users actually
 * need to drive the panel: a project badge, a repo dropdown, an
 * analyse/start button, and a refresh button. The window is narrow so the
 * controls are stacked tighter than the original's three-row layout.
 */

import { useState, useRef, useEffect } from 'react';
import { Search, RefreshCw, Play, Sparkles, FolderOpen } from 'lucide-react';
import { useAppState } from './state';

export const Header = ({ onSelectFromSearch }: {
    onSelectFromSearch?: (nodeId: string) => void;
}): React.ReactElement => {
    const {
        graph,
        currentRepo,
        availableRepos,
        status,
        isAnalyzing,
        postMessage,
        setRightPanelTab,
    } = useAppState();

    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isRepoOpen, setIsRepoOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement | null>(null);
    const repoRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) setIsSearchOpen(false);
            if (repoRef.current && !repoRef.current.contains(e.target as Node)) setIsRepoOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setIsSearchOpen(true);
            }
            if (e.key === 'Escape') setIsSearchOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, []);

    const searchResults = (() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q || !graph) return [];
        return graph.nodes
            .filter(node => (node.properties?.name ?? node.id).toLowerCase().includes(q))
            .slice(0, 8);
    })();

    const projectLabel = (() => {
        if (currentRepo) {
            const known = availableRepos.find(repo => (repo.repoPath || repo.path || repo.name) === currentRepo);
            if (known?.name) return known.name;
            return currentRepo.split(/[\\/]/).filter(Boolean).pop() ?? currentRepo;
        }
        if (availableRepos.length) {
            return availableRepos[0].name;
        }
        return 'GitNexus';
    })();

    const nodeCount = graph?.nodes.length ?? 0;

    const runStart = () => {
        postMessage(status.running ? { type: 'analyze' } : { type: 'start' });
    };

    const runSemantic = () => {
        if (!searchQuery.trim() || !currentRepo) return;
        setRightPanelTab('search');
        postMessage({ type: 'search', query: searchQuery.trim(), repository: currentRepo });
    };

    return (
        <header className="flex items-center justify-between gap-3 border-b border-dashed border-border-subtle bg-deep px-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
                {/* Brand */}
                <div className="flex shrink-0 items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-accent to-node-interface text-[11px] font-bold text-white shadow-glow">◇</div>
                    <div className="leading-tight">
                        <div className="text-[13px] font-semibold tracking-tight">GitNexus</div>
                        <div className="text-[9px] uppercase tracking-wider text-text-muted">inside Ultraview</div>
                    </div>
                </div>

                {/* Repo switcher */}
                <div className="relative" ref={repoRef}>
                    <button
                        data-testid="repo-switcher-trigger"
                        onClick={() => setIsRepoOpen(value => !value)}
                        className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-elevated px-2.5 py-1 text-[12px] hover:border-border-default"
                    >
                        <FolderOpen size={12} className="text-text-muted" />
                        <span className="max-w-[180px] truncate">{projectLabel}</span>
                        <span className="text-text-muted">▾</span>
                    </button>
                    {isRepoOpen && (
                        <div className="absolute left-0 top-[calc(100%+4px)] z-30 max-h-[260px] w-[280px] overflow-auto rounded-md border border-border-subtle bg-deep shadow-2xl">
                            {availableRepos.length === 0 && (
                                <div className="px-3 py-2 text-[11px] text-text-muted">No indexed repositories</div>
                            )}
                            {availableRepos.map(repo => {
                                const value = repo.repoPath || repo.path || repo.name;
                                const active = value === currentRepo;
                                return (
                                    <button
                                        key={value}
                                        onClick={() => {
                                            setIsRepoOpen(false);
                                            postMessage({ type: 'selectRepository', repository: value });
                                        }}
                                        className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-elevated ${active ? 'bg-elevated' : ''}`}
                                    >
                                        <span className="truncate">{repo.name}</span>
                                        {repo.stats && (
                                            <span className="shrink-0 text-[10px] text-text-muted">{repo.stats.nodes ?? 0} ◇</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2">
                {/* Quick search */}
                <div className="relative" ref={searchRef}>
                    <div className="flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-elevated px-2 text-[11px]">
                        <Search size={11} className="text-text-muted" />
                        <input
                            value={searchQuery}
                            onChange={event => setSearchQuery(event.target.value)}
                            onFocus={() => setIsSearchOpen(true)}
                            onKeyDown={event => {
                                if (event.key === 'Enter') {
                                    if (searchResults.length > 0) {
                                        const first = searchResults[0];
                                        setIsSearchOpen(false);
                                        onSelectFromSearch?.(first.id);
                                    } else {
                                        runSemantic();
                                    }
                                }
                            }}
                            placeholder="Find symbol or ask…"
                            className="w-[200px] bg-transparent text-[11px] text-text-primary outline-none placeholder:text-text-muted"
                        />
                        <kbd className="rounded border border-border-subtle bg-deep px-1 text-[9px] text-text-muted">⌘K</kbd>
                    </div>
                    {isSearchOpen && searchQuery.trim() && (
                        <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-[300px] rounded-md border border-border-subtle bg-deep shadow-2xl">
                            {searchResults.length === 0 && (
                                <div className="px-3 py-2 text-[11px] text-text-muted">
                                    No symbol matches. Press <span className="text-text-primary">Enter</span> to run a semantic search.
                                </div>
                            )}
                            {searchResults.length > 0 && (
                                <>
                                    <div className="border-b border-border-subtle px-3 py-1 text-[9px] uppercase tracking-wider text-text-muted">Symbol</div>
                                    {searchResults.map(node => (
                                        <button
                                            key={node.id}
                                            onClick={() => {
                                                setIsSearchOpen(false);
                                                onSelectFromSearch?.(node.id);
                                            }}
                                            className="block w-full truncate px-3 py-1.5 text-left text-[11px] hover:bg-elevated"
                                        >
                                            <span className="text-text-muted">{node.label.toLowerCase()} · </span>
                                            <span className="text-text-primary">{node.properties?.name ?? node.id}</span>
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </div>

                <button
                    onClick={() => currentRepo && postMessage({ type: 'refresh', repository: currentRepo })}
                    disabled={isAnalyzing}
                    className="flex h-7 items-center gap-1 rounded-md border border-border-subtle bg-elevated px-2 text-[11px] hover:border-border-default disabled:opacity-50"
                    title="Refresh graph from runtime"
                >
                    <RefreshCw size={11} className={isAnalyzing ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                </button>

                <button
                    onClick={runStart}
                    disabled={isAnalyzing}
                    className="flex h-7 items-center gap-1 rounded-md bg-gradient-to-br from-accent to-node-interface px-2.5 text-[11px] font-medium text-white shadow-glow disabled:opacity-50"
                    title={status.running ? 'Re-analyze the current workspace' : 'Start the GitNexus runtime'}
                >
                    {status.running ? <Sparkles size={11} /> : <Play size={11} />}
                    <span>{isAnalyzing ? 'Analyzing…' : status.running ? `Analyze (${nodeCount})` : 'Start'}</span>
                </button>
            </div>
        </header>
    );
};
