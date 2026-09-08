export interface GitNexusNodeProperties {
    name?: string;
    filePath?: string;
    startLine?: number;
    endLine?: number;
    language?: string;
    [key: string]: unknown;
}

export interface GitNexusNode {
    id: string;
    label: string;
    properties: GitNexusNodeProperties;
}

export interface GitNexusRelationship {
    id: string;
    sourceId: string;
    targetId: string;
    type: string;
    confidence?: number;
    reason?: string;
}

export interface GitNexusGraph {
    nodes: GitNexusNode[];
    relationships: GitNexusRelationship[];
}

export interface GitNexusRepository {
    name: string;
    path?: string;
    repoPath?: string;
    indexedAt?: string;
    lastCommit?: string;
    stats?: Record<string, number>;
}

export interface GitNexusSnapshot {
    repository?: string;
    repositories: GitNexusRepository[];
    graph: GitNexusGraph;
    clusters: unknown[];
    processes: unknown[];
}

export interface GitNexusRuntimeStatus {
    needsDownload?: boolean;
    running: boolean;
    managed: boolean;
    installing: boolean;
    port: number;
    version?: string;
    nodeVersion?: string;
    message: string;
}
